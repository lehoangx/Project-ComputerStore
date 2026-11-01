const bcrypt = require('bcryptjs');

const Product = require('../models/Product');
const Category = require('../models/Category');
const Review = require('../models/Review');
const Cart = require('../models/Cart');
const Coupon = require('../models/Coupon');
const Order = require('../models/Order');
const User = require('../models/User');
const transporter = require('../utils/mailer');
const vnpay = require('../utils/vnpay');

// Controller cho trang chủ
exports.getHomePage = async (req, res) => {
    try {
        // Thiết lập phân trang
        const featuredPage = parseInt(req.query.featuredPage) || 1;
        const latestPage = parseInt(req.query.latestPage) || 1;
        const limit = 8; // Số lượng sản phẩm mỗi trang
        
        // Đếm tổng số sản phẩm nổi bật
        const totalFeaturedProducts = await Product.countDocuments({ featured: true, active: true });
        const totalFeaturedPages = Math.ceil(totalFeaturedProducts / limit);
        
        // Đếm tổng số sản phẩm (để tính trang cho sản phẩm mới nhất)
        const totalProducts = await Product.countDocuments({ active: true });
        const totalLatestPages = Math.ceil(totalProducts / limit);
        
        // Lấy danh sách sản phẩm nổi bật có phân trang
        const featuredProducts = await Product.find({ featured: true, active: true })
            .populate('category')
            .skip((featuredPage - 1) * limit)
            .limit(limit);
        
        // Lấy danh sách sản phẩm mới nhất có phân trang
        const latestProducts = await Product.find({ active: true })
            .sort({ createdAt: -1 })
            .populate('category')
            .skip((latestPage - 1) * limit)
            .limit(limit);
        
        // Lấy danh sách danh mục
        const categories = await Category.find({ active: true });
        
        // Render trang chủ
        res.render('client/index', {
            title: 'Think Pro - Trang chủ',
            featuredProducts,
            latestProducts,
            categories,
            user: req.session.user || null,
            // Thông tin phân trang cho sản phẩm nổi bật
            featuredPage,
            totalFeaturedPages,
            totalFeaturedProducts,
            // Thông tin phân trang cho sản phẩm mới nhất
            latestPage,
            totalLatestPages,
            totalProducts
        });
    } catch (error) {
        console.error('Lỗi khi lấy dữ liệu trang chủ:', error);
        res.status(500).render('404', {
            title: 'Lỗi server',
            message: 'Đã xảy ra lỗi khi tải trang chủ, vui lòng thử lại sau'
        });
    }
};

// Controller cho trang chi tiết sản phẩm
exports.getProductDetail = async (req, res) => {
    try {
        const { slug } = req.params;
        
        // Lấy thông tin sản phẩm theo slug
        const product = await Product.findOne({ slug, active: true }).populate('category');
        
        if (!product) {
            return res.status(404).render('404', {
                title: 'Không tìm thấy sản phẩm',
                message: 'Sản phẩm bạn đang tìm kiếm không tồn tại hoặc đã bị xóa'
            });
        }

        // Lấy các sản phẩm liên quan ngẫu nhiên (cùng danh mục)
        const relatedProducts = await Product.aggregate([
            {
                $match: {
                    category: product.category._id,
                    _id: { $ne: product._id },
                    active: true
                }
            },
            {
                $sample: { size: 4 }
            },
            {
                $sort: { createdAt: -1 }
            }
        ]);
        
        // Lấy danh sách đánh giá đã được duyệt
        const reviews = await Review.find({ 
            product: product._id,
            status: 'approved'
        })
        .populate('user', 'name')
        .sort({ createdAt: -1 });
        
        // Tính điểm đánh giá trung bình
        let averageRating = 0;
        if (reviews.length > 0) {
            const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
            averageRating = (totalRating / reviews.length).toFixed(1);
        }

        // Tính số lượng đánh giá cho từng mức sao
        const ratingStats = {
            5: reviews.filter(review => review.rating === 5).length,
            4: reviews.filter(review => review.rating === 4).length,
            3: reviews.filter(review => review.rating === 3).length,
            2: reviews.filter(review => review.rating === 2).length,
            1: reviews.filter(review => review.rating === 1).length
        };

        // Tính phần trăm cho mỗi mức sao
        const ratingPercentages = {};
        for (let i = 1; i <= 5; i++) {
            ratingPercentages[i] = reviews.length > 0 ? ((ratingStats[i] / reviews.length) * 100).toFixed(1) : 0;
        }
        
        // Kiểm tra xem người dùng đã đánh giá sản phẩm này chưa
        let userReviews = [];
        if (req.session.user) {
            const userId = req.session.user._id || req.session.user.id;
            
            userReviews = await Review.find({
                product: product._id,
                user: userId
            }).sort({ createdAt: -1 });
        }
        
        // Lấy danh sách danh mục cho menu
        const categories = await Category.find({ active: true });
        
        // Render trang chi tiết sản phẩm
        res.render('client/product-detail', {
            title: `${product.name} - Think Pro`,
            product,
            relatedProducts,
            reviews,
            averageRating,
            userReviews,
            categories,
            user: req.session.user || null,
            ratingStats,
            ratingPercentages
        });
    } catch (error) {
        console.error('Lỗi khi lấy chi tiết sản phẩm:', error);
        res.status(500).render('404', {
            title: 'Lỗi server',
            message: 'Đã xảy ra lỗi khi tải trang chi tiết sản phẩm, vui lòng thử lại sau'
        });
    }
};

// Controller để gửi đánh giá sản phẩm
exports.submitReview = async (req, res) => {
    try {
        const { productId, rating, comment } = req.body;
        
        // Kiểm tra dữ liệu đầu vào
        if (!productId || !rating || !comment) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng điền đầy đủ thông tin đánh giá'
            });
        }
        
        // Kiểm tra rating hợp lệ
        if (rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: 'Điểm đánh giá phải từ 1 đến 5 sao'
            });
        }
        
        // Kiểm tra độ dài comment
        if (comment.trim().length < 10) {
            return res.status(400).json({
                success: false,
                message: 'Nhận xét phải có ít nhất 10 ký tự'
            });
        }
        
        // Kiểm tra sản phẩm tồn tại
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy sản phẩm'
            });
        }
        
        // Tạo đánh giá mới
        const review = new Review({
            product: productId,
            user: req.session.user._id || req.session.user.id,
            rating: parseInt(rating),
            comment: comment.trim(),
            status: 'pending'
        });
        
        await review.save();
        
        return res.status(201).json({
            success: true,
            message: 'Gửi đánh giá thành công, vui lòng chờ quản trị viên duyệt'
        });
    } catch (error) {
        console.error('Lỗi khi gửi đánh giá:', error);
        
        // Kiểm tra loại lỗi để trả về thông báo phù hợp
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Dữ liệu đánh giá không hợp lệ: ' + Object.values(error.errors).map(e => e.message).join(', ')
            });
        }
        
        return res.status(500).json({
            success: false,
            message: 'Đã xảy ra lỗi khi gửi đánh giá, vui lòng thử lại sau'
        });
    }
};

// Controller để cập nhật đánh giá
exports.editReview = async (req, res) => {
    try {
        const { reviewId, rating, comment } = req.body;
        
        // Tìm đánh giá
        const review = await Review.findById(reviewId);
        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy đánh giá'
            });
        }
        
        // Kiểm tra đánh giá có thuộc về người dùng hiện tại không
        if (review.user.toString() !== (req.session.user._id || req.session.user.id).toString()) {
            return res.status(403).json({
                success: false,
                message: 'Bạn không có quyền cập nhật đánh giá này'
            });
        }
        
        // Kiểm tra đánh giá có đang ở trạng thái pending hoặc rejected không
        if (review.status !== 'pending' && review.status !== 'rejected') {
            return res.status(400).json({
                success: false,
                message: 'Chỉ có thể cập nhật đánh giá đang chờ duyệt hoặc bị từ chối'
            });
        }
        
        // Cập nhật đánh giá
        review.rating = rating;
        review.comment = comment;
        review.status = 'pending'; // Đặt lại trạng thái chờ duyệt
        await review.save();
        
        return res.status(200).json({
            success: true,
            message: 'Cập nhật đánh giá thành công, vui lòng chờ quản trị viên duyệt'
        });
    } catch (error) {
        console.error('Lỗi khi cập nhật đánh giá:', error);
        return res.status(500).json({
            success: false,
            message: 'Đã xảy ra lỗi khi cập nhật đánh giá, vui lòng thử lại sau'
        });
    }
};

// Controller cho trang tìm kiếm sản phẩm
exports.searchProducts = async (req, res) => {
    try {
        const { q, sort, priceRange, category } = req.query;
        let page = parseInt(req.query.page) || 1;
        const limit = 9; // Số sản phẩm trên mỗi trang
        const skip = (page - 1) * limit;
        
        // Tạo query tìm kiếm 
        const searchQuery = { active: true };
        
        // Escape các ký tự đặc biệt trong regex để tránh lỗi
        const escapeRegex = (string) => {
            return string ? string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
        };
        
        // Nếu có từ khóa tìm kiếm, thêm vào query
        if (q) {
            const safeQuery = escapeRegex(q);
            searchQuery.$or = [
                { name: { $regex: safeQuery, $options: 'i' } },
                { description: { $regex: safeQuery, $options: 'i' } }
            ];
        }

        // Nếu có chọn danh mục
        if (category) {
            const categoryDoc = await Category.findOne({ slug: category });
            if (categoryDoc) {
                searchQuery.category = categoryDoc._id;
            }
        }
        
        // Nếu có lọc giá
        if (priceRange) {
            const [min, max] = priceRange.split('-').map(price => parseInt(price));
            searchQuery.price = {};
            if (min) searchQuery.price.$gte = min;
            if (max) searchQuery.price.$lte = max;
        }
        
        // Đếm tổng số sản phẩm tìm thấy
        const totalProducts = await Product.countDocuments(searchQuery);
        const totalPages = Math.ceil(totalProducts / limit);
        
        // Xác định cách sắp xếp
        let sortOption = { createdAt: -1 }; // Mặc định: mới nhất
        
        if (sort) {
            switch (sort) {
                case 'price_asc':
                    sortOption = { price: 1 };
                    break;
                case 'price_desc':
                    sortOption = { price: -1 };
                    break;
                case 'name_asc':
                    sortOption = { name: 1 };
                    break;
                case 'name_desc':
                    sortOption = { name: -1 };
                    break;
                default:
                    sortOption = { createdAt: -1 };
            }
        }
        
        // Lấy sản phẩm theo trang
        const products = await Product.find(searchQuery)
            .populate('category')
            .sort(sortOption)
            .skip(skip)
            .limit(limit);
        
        // Lấy danh sách danh mục cho menu
        const categories = await Category.find({ active: true });
        
        // Render trang kết quả tìm kiếm
        res.render('client/search-results', {
            title: q ? `Kết quả tìm kiếm cho "${q}"` : 'Tất cả sản phẩm',
            products,
            q,
            currentPage: page,
            totalPages,
            totalProducts,
            categories,
            priceRange,
            category,
            sort: sort || 'newest',
            user: req.session.user || null
        });
    } catch (error) {
        console.error('Lỗi khi tìm kiếm sản phẩm:', error);
        res.status(500).render('404', {
            title: 'Lỗi server',
            message: 'Đã xảy ra lỗi khi tải trang tìm kiếm, vui lòng thử lại sau'
        });
    }
};

// Controller cho gợi ý tìm kiếm
exports.getSearchSuggestions = async (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q || q.length < 2) {
            return res.json({ suggestions: [] });
        }

        // Escape các ký tự đặc biệt trong regex để tránh lỗi
        const escapeRegex = (string) => {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        };
        
        const safeQuery = escapeRegex(q);

        // Tìm kiếm sản phẩm phù hợp
        const products = await Product.find({
            $or: [
                { name: { $regex: safeQuery, $options: 'i' } },
                { description: { $regex: safeQuery, $options: 'i' } }
            ],
            active: true
        })
        .select('name slug mainImage price discountPrice')
        .limit(5);

        // Format kết quả
        const suggestions = products.map(product => ({
            name: product.name,
            slug: product.slug,
            image: product.mainImage,
            price: product.discountPrice > 0 ? product.discountPrice : product.price
        }));

        res.json({ suggestions });
    } catch (error) {
        console.error('Lỗi khi lấy gợi ý tìm kiếm:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi khi lấy gợi ý tìm kiếm' });
    }
};

// Controller cho trang hiển thị sản phẩm theo danh mục
exports.getProductsByCategory = async (req, res) => {
    try {
        const { slug } = req.params;
        const { sort, priceRange } = req.query;
        let page = parseInt(req.query.page) || 1;
        const limit = 9; // Số sản phẩm trên mỗi trang
        const skip = (page - 1) * limit;
        
        // Tìm danh mục theo slug
        const category = await Category.findOne({ slug, active: true });
        
        if (!category) {
            return res.status(404).render('404', {
                title: 'Không tìm thấy danh mục',
                message: 'Danh mục bạn đang tìm kiếm không tồn tại hoặc đã bị xóa'
            });
        }
        
        // Tạo query
        const searchQuery = { 
            category: category._id,
            active: true
        };
        
        // Nếu có lọc giá
        if (priceRange) {
            const [min, max] = priceRange.split('-').map(price => parseInt(price));
            searchQuery.price = {};
            if (min) searchQuery.price.$gte = min;
            if (max) searchQuery.price.$lte = max;
        }
        
        // Đếm tổng số sản phẩm của danh mục
        const totalProducts = await Product.countDocuments(searchQuery);
        const totalPages = Math.ceil(totalProducts / limit);
        
        // Xác định cách sắp xếp
        let sortOption = { createdAt: -1 }; // Mặc định: mới nhất
        
        if (sort) {
            switch (sort) {
                case 'price_asc':
                    sortOption = { price: 1 };
                    break;
                case 'price_desc':
                    sortOption = { price: -1 };
                    break;
                case 'name_asc':
                    sortOption = { name: 1 };
                    break;
                case 'name_desc':
                    sortOption = { name: -1 };
                    break;
                default:
                    sortOption = { createdAt: -1 };
            }
        }
        
        // Lấy sản phẩm theo danh mục và trang
        const products = await Product.find(searchQuery)
            .populate('category')
            .sort(sortOption)
            .skip(skip)
            .limit(limit);
        
        // Lấy danh sách danh mục cho menu
        const categories = await Category.find({ active: true });
        
        // Render trang danh mục
        res.render('client/category', {
            title: `Danh mục: ${category.name}`,
            products,
            category,
            currentPage: page,
            totalPages,
            totalProducts,
            categories,
            priceRange,
            sort: sort || 'newest',
            user: req.session.user || null
        });
    } catch (error) {
        console.error('Lỗi khi lấy sản phẩm theo danh mục:', error);
        res.status(500).render('404', {
            title: 'Lỗi server',
            message: 'Đã xảy ra lỗi khi tải trang danh mục, vui lòng thử lại sau'
        });
    }
};

// Controller cho trang hiển thị tất cả sản phẩm
exports.getAllProducts = async (req, res) => {
    try {
        const { sort, priceRange } = req.query;
        let page = parseInt(req.query.page) || 1;
        const limit = 9; // Số sản phẩm trên mỗi trang
        const skip = (page - 1) * limit;
        
        // Tạo query
        const searchQuery = { active: true };
        
        // Nếu có lọc giá
        if (priceRange) {
            const [min, max] = priceRange.split('-').map(price => parseInt(price));
            searchQuery.price = {};
            if (min) searchQuery.price.$gte = min;
            if (max) searchQuery.price.$lte = max;
        }
        
        // Đếm tổng số sản phẩm
        const totalProducts = await Product.countDocuments(searchQuery);
        const totalPages = Math.ceil(totalProducts / limit);
        
        // Xác định cách sắp xếp
        let sortOption = { createdAt: -1 }; // Mặc định: mới nhất
        
        if (sort) {
            switch (sort) {
                case 'price_asc':
                    sortOption = { price: 1 };
                    break;
                case 'price_desc':
                    sortOption = { price: -1 };
                    break;
                case 'name_asc':
                    sortOption = { name: 1 };
                    break;
                case 'name_desc':
                    sortOption = { name: -1 };
                    break;
                default:
                    sortOption = { createdAt: -1 };
            }
        }
        
        // Lấy sản phẩm theo trang
        const products = await Product.find(searchQuery)
            .populate('category')
            .sort(sortOption)
            .skip(skip)
            .limit(limit);
        
        // Lấy danh sách danh mục cho menu
        const categories = await Category.find({ active: true });
        
        // Render trang tất cả sản phẩm
        res.render('client/products', {
            title: 'Tất cả sản phẩm',
            products,
            currentPage: page,
            totalPages,
            totalProducts,
            categories,
            priceRange,
            sort: sort || 'newest',
            user: req.session.user || null
        });
    } catch (error) {
        console.error('Lỗi khi lấy tất cả sản phẩm:', error);
        res.status(500).render('404', {
            title: 'Lỗi server',
            message: 'Đã xảy ra lỗi khi tải trang sản phẩm, vui lòng thử lại sau'
        });
    }
};

// Middleware để thêm thông tin giỏ hàng vào tất cả các yêu cầu
exports.cartMiddleware = async (req, res, next) => {
    try {
        if (req.session && req.session.user) {
            // Tìm giỏ hàng của người dùng hoặc tạo mới nếu chưa có
            let cart = await Cart.findOne({ user: req.session.user._id })
                                .populate({
                                    path: 'items.product',
                                    select: 'name price discountPrice mainImage slug'
                                })
                                .populate('coupon');
            
            if (cart) {
                // Tính tổng tiền giỏ hàng và lưu vào res.locals
                const totalPrice = cart.calculateTotalPrice();
                
                // Tính giá sau khi áp dụng mã giảm giá (nếu có)
                if (cart.coupon) {
                    const coupon = await Coupon.findById(cart.coupon);
                    if (coupon && coupon.isValid()) {
                        const discountedTotal = coupon.applyDiscount(totalPrice);
                        res.locals.cartTotal = discountedTotal;
                    } else {
                        res.locals.cartTotal = totalPrice;
                    }
                } else {
                    res.locals.cartTotal = totalPrice;
                }

                // Tính tổng số lượng sản phẩm trong giỏ hàng
                const cartItemCount = cart.items.reduce((total, item) => total + item.quantity, 0);
                res.locals.cartItemCount = cartItemCount;
            } else {
                res.locals.cartTotal = 0;
                res.locals.cartItemCount = 0;
            }
        } else {
            res.locals.cartTotal = 0;
            res.locals.cartItemCount = 0;
        }
        next();
    } catch (error) {
        console.error('Lỗi khi lấy thông tin giỏ hàng:', error);
        res.locals.cartTotal = 0;
        res.locals.cartItemCount = 0;
        next();
    }
};

// Hiển thị trang giỏ hàng
exports.getCart = async (req, res) => {
    try {
        // Kiểm tra người dùng đã đăng nhập chưa
        if (!req.session.user) {
            return res.render('client/cart', {
                title: 'Giỏ hàng',
                cart: null,
                user: req.session.user,
                categories: res.locals.categories
            });
        }

        // Tìm giỏ hàng của người dùng
        let cart = await Cart.findOne({ user: req.session.user._id })
                            .populate({
                                path: 'items.product',
                                select: 'name price discountPrice mainImage slug _id'
                            })
                            .populate('coupon');

        // Nếu không có giỏ hàng thì tạo mới
        if (!cart) {
            cart = new Cart({
                user: req.session.user._id,
                items: [],
                totalPrice: 0
            });
        }

        // Tính tổng tiền giỏ hàng
        const totalPrice = cart.calculateTotalPrice();
        
        // Tính giá sau khi áp dụng mã giảm giá (nếu có)
        if (cart.coupon) {
            const coupon = await Coupon.findById(cart.coupon);
            if (coupon && coupon.isValid()) {
                cart.discountedTotal = coupon.applyDiscount(totalPrice);
            } else {
                cart.discountedTotal = totalPrice;
                // Xóa mã giảm giá không hợp lệ
                cart.coupon = undefined;
                await cart.save();
            }
        }

        // Kiểm tra tồn kho trước khi cho phép thanh toán
        let outOfStockItems = [];
        for (const item of cart.items) {
            if (item.quantity > item.product.quantity) {
                outOfStockItems.push({
                    name: item.product.name,
                    inCart: item.quantity,
                    inStock: item.product.quantity
                });
            }
        }
        if (outOfStockItems.length > 0) {
            // Tính lại discountedTotal nếu có coupon
            if (cart.coupon) {
                const coupon = await Coupon.findById(cart.coupon);
                if (coupon && coupon.isValid()) {
                    cart.discountedTotal = coupon.applyDiscount(cart.totalPrice);
                } else {
                    cart.discountedTotal = cart.totalPrice;
                }
            }
            return res.render('client/cart', {
                title: 'Giỏ hàng',
                cart,
                user: req.session.user,
                categories: res.locals.categories,
                outOfStockItems
            });
        }

        res.render('client/cart', {
            title: 'Giỏ hàng',
            cart,
            user: req.session.user,
            categories: res.locals.categories
        });
    } catch (error) {
        console.error('Lỗi khi hiển thị giỏ hàng:', error);
        res.status(500).send('Đã xảy ra lỗi khi hiển thị giỏ hàng');
    }
};

// Thêm sản phẩm vào giỏ hàng
exports.addToCart = async (req, res) => {
    try {
        const { productId, quantity, buyNow } = req.body;
        
        // Tìm sản phẩm cần thêm vào giỏ hàng
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy sản phẩm'
            });
        }

        // Kiểm tra số lượng tồn kho
        if (product.quantity < quantity) {
            return res.status(400).json({
                success: false,
                message: 'Số lượng sản phẩm vượt quá tồn kho'
            });
        }

        // Tìm giỏ hàng của người dùng hoặc tạo mới
        let cart = await Cart.findOne({ user: req.session.user._id });
        
        if (!cart) {
            cart = new Cart({
                user: req.session.user._id,
                items: [],
                totalPrice: 0
            });
        }

        // Kiểm tra xem sản phẩm đã có trong giỏ hàng chưa
        const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);
        
        // Tính giá sản phẩm (ưu tiên giá khuyến mãi nếu có)
        const price = product.discountPrice > 0 ? product.discountPrice : product.price;

        if (itemIndex > -1) {
            // Sản phẩm đã có trong giỏ hàng, cập nhật số lượng
            // cart.items[itemIndex].quantity += quantity;
            const newQuantity = cart.items[itemIndex].quantity + quantity;
            
            // Kiểm tra tổng số lượng có vượt quá tồn kho không
            if (newQuantity > product.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Số lượng sản phẩm vượt quá tồn kho (Còn ${product.quantity} sản phẩm)`
                });
            }
            
            cart.items[itemIndex].quantity = newQuantity;
            
            cart.items[itemIndex].price = price;
        } else {
            // Sản phẩm chưa có trong giỏ hàng, thêm mới
            cart.items.push({
                product: productId,
                quantity,
                price
            });
        }

        // Tính lại tổng tiền giỏ hàng
        cart.calculateTotalPrice();
        
        // Cập nhật thời gian
        cart.updatedAt = Date.now();
        
        // Lưu giỏ hàng
        await cart.save();

        // Tính tổng giá nếu có áp dụng mã giảm giá
        let totalPrice = cart.totalPrice;
        if (cart.coupon) {
            const coupon = await Coupon.findById(cart.coupon);
            if (coupon && coupon.isValid()) {
                totalPrice = coupon.applyDiscount(totalPrice);
            }
        }

        // Tính tổng số lượng sản phẩm trong giỏ hàng
        const cartItemCount = cart.items.reduce((total, item) => total + item.quantity, 0);

        res.status(200).json({
            success: true,
            message: 'Đã thêm sản phẩm vào giỏ hàng',
            totalPrice,
            cartItemCount
        });
    } catch (error) {
        console.error('Lỗi khi thêm sản phẩm vào giỏ hàng:', error);
        res.status(500).json({
            success: false,
            message: 'Đã xảy ra lỗi khi thêm sản phẩm vào giỏ hàng'
        });
    }
};

// Cập nhật số lượng sản phẩm trong giỏ hàng
exports.updateCartItem = async (req, res) => {
    try {
        const { productId, quantity } = req.body;
        
        // Tìm giỏ hàng của người dùng
        const cart = await Cart.findOne({ user: req.session.user._id });
        
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy giỏ hàng'
            });
        }

        // Tìm sản phẩm trong giỏ hàng
        const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);
        
        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy sản phẩm trong giỏ hàng'
            });
        }

        // Kiểm tra số lượng tồn kho chỉ khi tăng số lượng
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy sản phẩm'
            });
        }

        // Chỉ kiểm tra tồn kho khi tăng số lượng
        if (quantity > cart.items[itemIndex].quantity && product.quantity < quantity) {
            return res.status(400).json({
                success: false,
                message: `Sản phẩm ${product.name} chỉ còn ${product.quantity} sản phẩm trong kho`
            });
        }

        // Cập nhật số lượng
        cart.items[itemIndex].quantity = quantity;
        
        // Tính lại tổng tiền giỏ hàng
        cart.calculateTotalPrice();
        
        // Cập nhật thời gian
        cart.updatedAt = Date.now();
        
        // Lưu giỏ hàng
        await cart.save();

        res.status(200).json({
            success: true,
            message: 'Đã cập nhật giỏ hàng',
            totalPrice: cart.totalPrice
        });
    } catch (error) {
        console.error('Lỗi khi cập nhật giỏ hàng:', error);
        res.status(500).json({
            success: false,
            message: 'Đã xảy ra lỗi khi cập nhật giỏ hàng'
        });
    }
};

// Xóa sản phẩm khỏi giỏ hàng
exports.removeCartItem = async (req, res) => {
    try {
        const { productId } = req.body;
        
        // Tìm giỏ hàng của người dùng
        const cart = await Cart.findOne({ user: req.session.user._id });
        
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy giỏ hàng'
            });
        }

        // Lọc bỏ sản phẩm khỏi giỏ hàng
        cart.items = cart.items.filter(item => item.product.toString() !== productId);
        
        // Tính lại tổng tiền giỏ hàng
        cart.calculateTotalPrice();
        
        // Cập nhật thời gian
        cart.updatedAt = Date.now();
        
        // Lưu giỏ hàng
        await cart.save();

        res.status(200).json({
            success: true,
            message: 'Đã xóa sản phẩm khỏi giỏ hàng',
            totalPrice: cart.totalPrice
        });
    } catch (error) {
        console.error('Lỗi khi xóa sản phẩm khỏi giỏ hàng:', error);
        res.status(500).json({
            success: false,
            message: 'Đã xảy ra lỗi khi xóa sản phẩm khỏi giỏ hàng'
        });
    }
};

// Áp dụng mã giảm giá
exports.applyCoupon = async (req, res) => {
    try {
        const { code } = req.body;
        
        // Tìm giỏ hàng của người dùng
        const cart = await Cart.findOne({ user: req.session.user._id });
        
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy giỏ hàng'
            });
        }

        // Nếu code là null thì xóa mã giảm giá
        if (code === null) {
            cart.coupon = undefined;
            await cart.save();
            
            return res.status(200).json({
                success: true,
                message: 'Đã xóa mã giảm giá',
                totalPrice: cart.totalPrice
            });
        }

        // Tìm mã giảm giá
        const coupon = await Coupon.findOne({ code: code.toUpperCase() });
        
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Mã giảm giá không hợp lệ'
            });
        }

        // Kiểm tra mã giảm giá có hợp lệ không
        if (!coupon.isValid()) {
            return res.status(400).json({
                success: false,
                message: 'Mã giảm giá đã hết hạn hoặc không còn hiệu lực'
            });
        }

        // Kiểm tra tổng tiền tối thiểu
        if (cart.totalPrice < coupon.minSpend) {
            return res.status(400).json({
                success: false,
                message: `Giỏ hàng phải có giá trị tối thiểu ${coupon.minSpend.toLocaleString('vi-VN')}đ để áp dụng mã này`
            });
        }

        // Áp dụng mã giảm giá
        cart.coupon = coupon._id;
        
        // Cập nhật thời gian
        cart.updatedAt = Date.now();
        
        // Lưu giỏ hàng
        await cart.save();

        // Tính giá sau khi áp dụng mã giảm giá
        const discountedTotal = coupon.applyDiscount(cart.totalPrice);

        res.status(200).json({
            success: true,
            message: 'Đã áp dụng mã giảm giá',
            totalPrice: discountedTotal,
            discount: cart.totalPrice - discountedTotal
        });
    } catch (error) {
        console.error('Lỗi khi áp dụng mã giảm giá:', error);
        res.status(500).json({
            success: false,
            message: 'Đã xảy ra lỗi khi áp dụng mã giảm giá'
        });
    }
};






// ==========================================
// BỔ SUNG CÁC HÀM CLIENT CONTROLLER CÒN THIẾU
// ==========================================

// Hiển thị trang thanh toán
exports.getCheckout = async (req, res) => {
    try {
        const cart = await Cart.findOne({ user: req.session.user._id })
            .populate('items.product')
            .populate('coupon');

        if (!cart || !cart.items || cart.items.length === 0) {
            return res.render('client/checkout', {
                title: 'Thanh toán',
                cart: null,
                user: req.session.user
            });
        }

        res.render('client/checkout', {
            title: 'Thanh toán',
            cart,
            user: req.session.user
        });
    } catch (error) {
        console.error('Lỗi khi tải trang thanh toán:', error);
        res.status(500).render('404', { title: 'Lỗi server', message: 'Đã xảy ra lỗi' });
    }
};

// Tạo đơn hàng mới
exports.createOrder = async (req, res) => {
    try {
        const { fullName, phone, city, district, ward, address, note, paymentMethod } = req.body;
        const shippingFee = parseInt(req.body.shippingFee) || 0;

        const cart = await Cart.findOne({ user: req.session.user._id })
            .populate('items.product')
            .populate('coupon');

        if (!cart || !cart.items || cart.items.length === 0) {
            if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
                return res.status(400).json({ success: false, message: 'Giỏ hàng đang trống' });
            }
            return res.redirect('/cart');
        }

        const items = cart.items.map(item => ({
            product: item.product._id,
            name: item.product.name,
            price: item.price,
            quantity: item.quantity,
            image: item.product.images && item.product.images.length > 0 ? item.product.images[0] : '/images/products/default.png'
        }));

        const totalPrice = cart.totalPrice;
        let discountPrice = 0;
        if (cart.coupon) {
            discountPrice = Math.max(0, cart.totalPrice - cart.coupon.applyDiscount(cart.totalPrice));
        }
        const finalPrice = Math.max(0, totalPrice - discountPrice + shippingFee);

        const order = new Order({
            user: req.session.user._id,
            items,
            shippingAddress: {
                fullName: fullName || req.session.user.name,
                phone: phone || req.session.user.phone,
                city: city || '',
                district: district || '',
                ward: ward || '',
                address: address || '',
                note: note || ''
            },
            paymentMethod: paymentMethod || 'cod',
            paymentStatus: 'pending',
            totalPrice,
            discountPrice,
            shippingFee,
            finalPrice,
            coupon: cart.coupon ? cart.coupon._id : undefined,
            status: 'pending'
        });

        await order.save();

        // Xóa giỏ hàng sau khi đặt thành công
        cart.items = [];
        cart.coupon = undefined;
        cart.totalPrice = 0;
        await cart.save();

        // Nếu thanh toán qua VNPay hoặc yêu cầu JSON
        if (paymentMethod === 'vnpay' || req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
            return res.status(200).json({
                success: true,
                orderCode: order.orderCode,
                finalPrice: order.finalPrice
            });
        }

        // Với COD hoặc banking
        res.redirect(`/checkout/success/${order.orderCode}`);
    } catch (error) {
        console.error('Lỗi khi tạo đơn hàng:', error);
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
            return res.status(500).json({ success: false, message: 'Đã xảy ra lỗi khi tạo đơn hàng' });
        }
        res.redirect('/checkout?error=order_failed');
    }
};

// Trang đặt hàng thành công
exports.getOrderSuccess = async (req, res) => {
    try {
        const { orderCode } = req.params;
        const order = await Order.findOne({ orderCode, user: req.session.user._id })
            .populate('items.product')
            .populate('coupon');

        if (!order) {
            return res.redirect('/account/orders');
        }

        const vnpayError = req.query.vnpayError || null;
        res.render('client/order-success', {
            title: 'Đặt hàng thành công',
            order,
            vnpayError,
            user: req.session.user
        });
    } catch (error) {
        console.error('Lỗi trang đặt hàng thành công:', error);
        res.redirect('/account/orders');
    }
};

// Trang chi tiết đơn hàng
exports.getOrderDetail = async (req, res) => {
    try {
        const { orderCode } = req.params;
        const order = await Order.findOne({ orderCode, user: req.session.user._id })
            .populate('items.product')
            .populate('coupon');

        if (!order) {
            return res.redirect('/account/orders');
        }

        res.render('client/order-detail', {
            title: `Chi tiết đơn hàng #${order.orderCode}`,
            order,
            user: req.session.user
        });
    } catch (error) {
        console.error('Lỗi xem chi tiết đơn hàng:', error);
        res.redirect('/account/orders');
    }
};

// Hủy đơn hàng
exports.cancelOrder = async (req, res) => {
    try {
        const { orderCode } = req.params;
        const order = await Order.findOne({ orderCode, user: req.session.user._id });

        if (order && order.status === 'pending') {
            order.status = 'cancelled';
            await order.save();
        }

        res.redirect(`/orders/${orderCode}`);
    } catch (error) {
        console.error('Lỗi hủy đơn hàng:', error);
        res.redirect('/account/orders');
    }
};

// Tạo URL thanh toán VNPay (hỗ trợ mock fallback an toàn khi chưa cấu hình)
exports.createVnpayPayment = async (req, res) => {
    try {
        const { orderCode, finalPrice } = req.body;
        const order = await Order.findOne({ orderCode, user: req.session.user._id });

        if (!order) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
        }

        let ipAddr = req.headers['x-forwarded-for'] ||
            req.connection?.remoteAddress ||
            req.socket?.remoteAddress ||
            '127.0.0.1';
        if (ipAddr.includes(',')) ipAddr = ipAddr.split(',')[0].trim();
        if (ipAddr === '::1') ipAddr = '127.0.0.1';

        const returnUrl = `${req.protocol}://${req.get('host')}/vnpay-return`;

        // Nếu đã cấu hình key VNPay thật
        if (process.env.TMN_CODE && process.env.TMN_CODE !== 'your_vnpay_TmnCode' &&
            process.env.SECURE_SECRET && process.env.SECURE_SECRET !== 'your_vnpay_HashSecret') {
            const paymentUrl = vnpay.buildPaymentUrl({
                vnp_Amount: finalPrice || order.finalPrice,
                vnp_IpAddr: ipAddr,
                vnp_TxnRef: order.orderCode,
                vnp_OrderInfo: 'Thanh toan don hang ' + order.orderCode,
                vnp_OrderType: 'other',
                vnp_ReturnUrl: returnUrl,
                vnp_Locale: 'vn'
            });
            return res.json({ success: true, paymentUrl });
        } else {
            // Chế độ mô phỏng an toàn (Mock) khi chưa cấu hình VNPay
            return res.json({
                success: true,
                paymentUrl: `/vnpay-return?vnp_ResponseCode=00&vnp_TxnRef=${order.orderCode}&mock=true`
            });
        }
    } catch (error) {
        console.error('Lỗi VNPay Payment:', error);
        res.status(500).json({ success: false, message: 'Đã xảy ra lỗi khởi tạo VNPay' });
    }
};

// Xử lý callback sau khi thanh toán VNPay
exports.vnpayReturn = async (req, res) => {
    try {
        const vnp_Params = req.query;
        const orderCode = vnp_Params['vnp_TxnRef'];
        const responseCode = vnp_Params['vnp_ResponseCode'];

        const order = await Order.findOne({ orderCode });
        if (!order) {
            return res.redirect('/account/orders');
        }

        if (responseCode === '00') {
            order.paymentStatus = 'paid';
            order.status = 'confirmed';
            await order.save();
            return res.redirect(`/checkout/success/${orderCode}`);
        } else {
            order.paymentStatus = 'failed';
            await order.save();
            return res.redirect(`/checkout/success/${orderCode}?vnpayError=Thanh+toán+không+thành+công`);
        }
    } catch (error) {
        console.error('Lỗi VNPay Return:', error);
        res.redirect('/account/orders');
    }
};

// Thử lại thanh toán VNPay
exports.retryVnpayPayment = async (req, res) => {
    try {
        const { orderCode } = req.params;
        res.redirect(`/orders/${orderCode}`);
    } catch (error) {
        console.error('Lỗi retry VNPay:', error);
        res.redirect('/account/orders');
    }
};

// Trang thông tin cá nhân
exports.getAccountInfo = async (req, res) => {
    try {
        const user = await User.findById(req.session.user._id);
        if (!user) return res.redirect('/auth/login');

        res.render('client/account/info', {
            title: 'Thông tin tài khoản',
            activeMenu: 'info',
            userData: user,
            user,
            success: req.query.success,
            error: req.query.error,
            showPasswordModal: req.query.modal === 'password'
        });
    } catch (error) {
        console.error('Lỗi xem thông tin tài khoản:', error);
        res.redirect('/');
    }
};

// Danh sách đơn hàng cá nhân
exports.getMyOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;

        const totalOrders = await Order.countDocuments({ user: req.session.user._id });
        const totalPages = Math.ceil(totalOrders / limit) || 1;

        const orders = await Order.find({ user: req.session.user._id })
            .populate('items.product')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.render('client/account/orders', {
            title: 'Lịch sử đơn hàng',
            activeMenu: 'orders',
            orders,
            currentPage: page,
            totalPages,
            totalOrders,
            user: req.session.user
        });
    } catch (error) {
        console.error('Lỗi xem lịch sử đơn hàng:', error);
        res.redirect('/account');
    }
};

// Danh sách đánh giá cá nhân
exports.getMyReviews = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;

        const totalReviews = await Review.countDocuments({ user: req.session.user._id });
        const totalPages = Math.ceil(totalReviews / limit) || 1;

        const reviews = await Review.find({ user: req.session.user._id })
            .populate('product')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.render('client/account/reviews', {
            title: 'Đánh giá của tôi',
            activeMenu: 'reviews',
            reviews,
            currentPage: page,
            totalPages,
            totalReviews,
            user: req.session.user
        });
    } catch (error) {
        console.error('Lỗi xem đánh giá cá nhân:', error);
        res.redirect('/account');
    }
};

// Cập nhật thông tin cá nhân
exports.updateProfile = async (req, res) => {
    try {
        const { name, phone, address } = req.body;
        if (!name || !phone) {
            return res.redirect('/account?error=missing_fields');
        }

        const user = await User.findByIdAndUpdate(
            req.session.user._id,
            { name, phone, address },
            { new: true }
        );

        if (!user) {
            return res.redirect('/account?error=user_not_found');
        }

        req.session.user = user;
        res.redirect('/account?success=updated');
    } catch (error) {
        console.error('Lỗi cập nhật hồ sơ:', error);
        res.redirect('/account?error=update_failed');
    }
};

// Đổi mật khẩu
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.redirect('/account?error=missing_fields&modal=password');
        }

        if (newPassword !== confirmPassword) {
            return res.redirect('/account?error=password_mismatch&modal=password');
        }

        if (newPassword.length < 6) {
            return res.redirect('/account?error=password_length&modal=password');
        }

        const user = await User.findById(req.session.user._id);
        if (!user) {
            return res.redirect('/auth/login');
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.redirect('/account?error=wrong_current_password&modal=password');
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.redirect('/account?success=updated');
    } catch (error) {
        console.error('Lỗi đổi mật khẩu:', error);
        res.redirect('/account?error=change_password_failed&modal=password');
    }
};

const User = require('../models/User');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const Review = require('../models/Review');
const Order = require('../models/Order');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Cấu hình multer cho upload ảnh danh mục
const categoryStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = 'public/uploads/categories';
        // Đảm bảo thư mục tồn tại
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'category-' + uniqueSuffix + ext);
    }
});

const categoryUpload = multer({
    storage: categoryStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Giới hạn 5MB
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Chỉ chấp nhận file hình ảnh: jpeg, jpg, png, gif, webp'));
    }
}).single('image');

// Cấu hình multer cho upload ảnh sản phẩm
const productStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = 'public/uploads/products';
        // Đảm bảo thư mục tồn tại
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'product-' + uniqueSuffix + ext);
    }
});

const productUpload = multer({
    storage: productStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Giới hạn 5MB
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Chỉ chấp nhận file hình ảnh: jpeg, jpg, png, gif, webp'));
    }
});

// Hiển thị dashboard admin
exports.showDashboard = async (req, res) => {
    try {
        // Lấy khoảng thời gian từ query params, mặc định là 30 ngày gần nhất
        const timeRange = req.query.timeRange || '30days';
        let startDate = new Date();
        let endDate = new Date();
        
        // Xác định khoảng thời gian dựa trên tham số
        switch(timeRange) {
            case '7days':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case '30days':
                startDate.setDate(startDate.getDate() - 30);
                break;
            case '90days':
                startDate.setDate(startDate.getDate() - 90);
                break;
            case 'thismonth':
                startDate.setDate(1); // Ngày đầu tiên của tháng hiện tại
                break;
            case 'lastmonth':
                startDate.setMonth(startDate.getMonth() - 1);
                startDate.setDate(1);
                endDate.setDate(0); // Ngày cuối cùng của tháng trước
                break;
            case 'thisyear':
                startDate.setMonth(0, 1); // Ngày 1 tháng 1 năm hiện tại
                break;
            default:
                startDate.setDate(startDate.getDate() - 30);
        }

        // Đặt giờ bắt đầu và kết thúc
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        
        // Đếm số người dùng và sản phẩm
        const userCount = await User.countDocuments();
        const productCount = await Product.countDocuments();
        const categoryCount = await Category.countDocuments();
        const couponCount = await Coupon.countDocuments();
        
        // Thống kê đơn hàng
        const totalOrders = await Order.countDocuments();
        const pendingOrders = await Order.countDocuments({ status: 'pending' });
        const shippingOrders = await Order.countDocuments({ status: 'shipping' });
        const deliveredOrders = await Order.countDocuments({ status: 'delivered' });
        
        // Thống kê doanh thu
        const totalRevenue = await Order.aggregate([
            { $match: { status: 'delivered' } },
            { $group: { _id: null, total: { $sum: '$finalPrice' } } }
        ]);

        // Đơn hàng mới nhất
        const latestOrders = await Order.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('user', 'name email');
            
        // Đơn hàng theo ngày trong khoảng thời gian
        const days = [];
        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            days.push(new Date(currentDate));
            currentDate.setDate(currentDate.getDate() + 1);
        }

        const ordersByDay = await Promise.all(days.map(async (date) => {
            const dayStart = new Date(date);
            dayStart.setHours(0, 0, 0, 0);
            
            const dayEnd = new Date(date);
            dayEnd.setHours(23, 59, 59, 999);
            
            const count = await Order.countDocuments({
                createdAt: { $gte: dayStart, $lte: dayEnd }
            });
            
            return {
                date: date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
                count
            };
        }));
        
        // Doanh thu theo ngày trong khoảng thời gian
        const revenueByDay = await Promise.all(days.map(async (date) => {
            const dayStart = new Date(date);
            dayStart.setHours(0, 0, 0, 0);
            
            const dayEnd = new Date(date);
            dayEnd.setHours(23, 59, 59, 999);
            
            const result = await Order.aggregate([
                { 
                    $match: { 
                        createdAt: { $gte: dayStart, $lte: dayEnd },
                        status: 'delivered'
                    } 
                },
                { 
                    $group: { 
                        _id: null, 
                        revenue: { $sum: '$finalPrice' } 
                    } 
                }
            ]);
            
            return {
                date: date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
                revenue: result.length > 0 ? result[0].revenue : 0
            };
        }));
        
        // Thống kê doanh thu theo danh mục
        const categories = await Category.find();
        const revenueByCategory = [];
        
        // Lấy tất cả sản phẩm và gom nhóm theo danh mục
        const products = await Product.find().populate('category');
        const productsByCategory = {};
        
        // Khởi tạo danh sách danh mục
        for (const category of categories) {
            productsByCategory[category._id.toString()] = {
                name: category.name,
                products: [],
                totalRevenue: 0
            };
        }
        
        // Gom sản phẩm theo danh mục
        for (const product of products) {
            if (product.category && productsByCategory[product.category._id.toString()]) {
                productsByCategory[product.category._id.toString()].products.push(product._id.toString());
            }
        }
        
        // Lấy tất cả đơn hàng đã giao thành công
        const orders = await Order.find({ 
            status: 'delivered',
            createdAt: { $gte: startDate, $lte: endDate }
        });
        
        // Tính doanh thu cho từng danh mục
        for (const order of orders) {
            if (order.items && order.items.length > 0) {
                for (const item of order.items) {
                    // Tìm sản phẩm
                    const product = await Product.findById(item.product);
                    if (product && product.category) {
                        const categoryId = product.category.toString();
                        if (productsByCategory[categoryId]) {
                            // Tính doanh thu = giá x số lượng
                            productsByCategory[categoryId].totalRevenue += (item.price * item.quantity);
                        }
                    }
                }
            }
        }
        
        // Chuyển đổi thành mảng để truyền vào view
        for (const categoryId in productsByCategory) {
            revenueByCategory.push({
                name: productsByCategory[categoryId].name,
                revenue: Math.round(productsByCategory[categoryId].totalRevenue / 1000000) // Đổi sang đơn vị triệu
            });
        }
        
        // Sắp xếp giảm dần theo doanh thu
        revenueByCategory.sort((a, b) => b.revenue - a.revenue);
        
        // Giới hạn 5 danh mục có doanh thu cao nhất
        const top5Categories = revenueByCategory.slice(0, 5);
        
        // Thống kê sản phẩm bán chạy
        const topSellingProducts = [];
        const productSales = {};
        
        // Tính số lượng bán cho từng sản phẩm
        for (const order of orders) {
            if (order.items && order.items.length > 0) {
                for (const item of order.items) {
                    const productId = item.product.toString();
                    if (!productSales[productId]) {
                        // Tìm thông tin sản phẩm từ database
                        const product = await Product.findById(productId);
                        productSales[productId] = {
                            id: productId,
                            name: item.name,
                            image: item.image,
                            slug: product ? product.slug : '',
                            quantity: 0,
                            revenue: 0
                        };
                    }
                    productSales[productId].quantity += item.quantity;
                    productSales[productId].revenue += (item.price * item.quantity);
                }
            }
        }
        
        // Chuyển đổi thành mảng và sắp xếp
        for (const productId in productSales) {
            topSellingProducts.push(productSales[productId]);
        }
        
        // Sắp xếp theo số lượng bán
        topSellingProducts.sort((a, b) => b.quantity - a.quantity);
        
        // Lấy 10 sản phẩm bán chạy nhất
        const top10Products = topSellingProducts.slice(0, 10);

        res.render('admin/admin-dashboard', {
            title: 'Trang quản trị',
            user: req.session.user,
            userCount,
            productCount,
            categoryCount,
            couponCount,
            totalOrders,
            pendingOrders,
            shippingOrders,
            deliveredOrders,
            totalRevenue: totalRevenue.length > 0 ? totalRevenue[0].total : 0,
            latestOrders,
            ordersByDay,
            revenueByCategory: top5Categories,
            revenueByDay,
            topSellingProducts: top10Products,
            timeRange
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Lỗi server');
    }
};

// Hiển thị danh sách người dùng
exports.getUsers = async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });
        
        res.render('admin/user/list', {
            title: 'Quản lý người dùng',
            user: req.session.user,
            users,
            success: req.query.success,
            error: req.query.error,
            currentUser: req.session.user
        });
    } catch (error) {
        console.error('Lỗi lấy danh sách người dùng:', error);
        res.status(500).send('Lỗi server');
    }
};

// Hiển thị form thêm người dùng
exports.getAddUserForm = (req, res) => {
    res.render('admin/user/add', {
        title: 'Thêm người dùng',
        user: req.session.user,
        error: req.query.error,
        userData: req.session.userData || {}
    });
    
    // Xóa dữ liệu tạm thời trong session
    delete req.session.userData;
};

// Thêm người dùng mới
exports.addUser = async (req, res) => {
    try {
        const { name, email, phone, address, city, district, ward, password, role } = req.body;
        
        // Kiểm tra email đã tồn tại chưa
        const userExists = await User.findOne({ email });
        
        if (userExists) {
            req.session.userData = { name, email, phone, address, city, district, ward, role };
            return res.render('admin/user/add', {
                title: 'Thêm người dùng',
                error: 'Email đã được sử dụng',
                userData: { name, email, phone, address, city, district, ward, role },
                user: req.session.user
            });
        }
        
        // Tạo user mới
        const newUser = new User({
            name,
            email,
            phone,
            address,
            city,
            district,
            ward,
            password,
            role: role || 'user'
        });
        
        await newUser.save();
        
        res.redirect('/admin/users?success=added');
    } catch (error) {
        console.error('Lỗi thêm người dùng:', error);
        
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.render('admin/user/add', {
                title: 'Thêm người dùng',
                error: messages[0],
                userData: req.body,
                user: req.session.user
            });
        }
        
        return res.render('admin/user/add', {
            title: 'Thêm người dùng',
            error: 'Lỗi server, vui lòng thử lại sau',
            userData: req.body,
            user: req.session.user
        });
    }
};

// Hiển thị form chỉnh sửa người dùng
exports.getEditUserForm = async (req, res) => {
    try {
        const userData = await User.findById(req.params.id);
        
        if (!userData) {
            return res.redirect('/admin/users?error=not-found');
        }
        
        res.render('admin/user/edit', {
            title: 'Chỉnh sửa người dùng',
            userData,
            user: req.session.user
        });
    } catch (error) {
        console.error('Lỗi lấy thông tin người dùng:', error);
        res.redirect('/admin/users?error=not-found');
    }
};

// Cập nhật thông tin người dùng
exports.updateUser = async (req, res) => {
    try {
        const { name, email, phone, address, city, district, ward, role, password } = req.body;
        
        // Kiểm tra người dùng tồn tại
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.redirect('/admin/users?error=not-found');
        }
        
        // Kiểm tra email đã tồn tại chưa (nếu thay đổi)
        if (email !== user.email) {
            const userExists = await User.findOne({ email });
            
            if (userExists) {
                return res.render('admin/user/edit', {
                    title: 'Chỉnh sửa người dùng',
                    error: 'Email đã được sử dụng bởi người dùng khác',
                    userData: { _id: req.params.id, name, email, phone, address, city, district, ward, role },
                    user: req.session.user
                });
            }
        }
        
        // Cập nhật thông tin
        user.name = name;
        user.email = email;
        user.phone = phone;
        user.address = address;
        user.city = city;
        user.district = district;
        user.ward = ward;
        user.role = role;
        
        // Cập nhật mật khẩu nếu có
        if (password && password.trim() !== '') {
            user.password = password;
        }
        
        await user.save();
        
        res.redirect('/admin/users?success=updated');
    } catch (error) {
        console.error('Lỗi cập nhật người dùng:', error);
        
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.render('admin/user/edit', {
                title: 'Chỉnh sửa người dùng',
                error: messages[0],
                userData: { _id: req.params.id, ...req.body },
                user: req.session.user
            });
        }
        
        return res.render('admin/user/edit', {
            title: 'Chỉnh sửa người dùng',
            error: 'Lỗi server, vui lòng thử lại sau',
            userData: { _id: req.params.id, ...req.body },
            user: req.session.user
        });
    }
};

// Xóa người dùng
exports.deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.redirect('/admin/users?error=not-found');
        }
        
        await user.deleteOne();
        
        res.redirect('/admin/users?success=deleted');
    } catch (error) {
        console.error('Lỗi xóa người dùng:', error);
        res.redirect('/admin/users?error=delete-failed');
    }
};

// Hiển thị danh sách danh mục sản phẩm
exports.getCategories = async (req, res) => {
    try {
        const categories = await Category.find().sort({ createdAt: -1 });
        
        res.render('admin/category/list', {
            title: 'Quản lý danh mục sản phẩm',
            user: req.session.user,
            categories,
            success: req.query.success,
            error: req.query.error
        });
    } catch (error) {
        console.error('Lỗi lấy danh sách danh mục:', error);
        res.status(500).send('Lỗi server');
    }
};

// Hiển thị form thêm danh mục
exports.getAddCategoryForm = (req, res) => {
    res.render('admin/category/add', {
        title: 'Thêm danh mục sản phẩm',
        user: req.session.user,
        error: null
    });
};

// Thêm danh mục mới
exports.addCategory = async (req, res) => {
    try {
        categoryUpload(req, res, async function(err) {
            if (err) {
                return res.render('admin/category/add', {
                    title: 'Thêm danh mục sản phẩm',
                    error: err.message,
                    user: req.session.user
                });
            }

            try {
                const { name, description, slug, active } = req.body;
                let categorySlug = slug;
                
                // Tạo slug từ tên nếu không có slug
                if (!categorySlug || categorySlug.trim() === '') {
                    categorySlug = name.toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .replace(/đ/g, 'd')
                        .replace(/Đ/g, 'D')
                        .replace(/[^a-z0-9\s]/g, '')
                        .replace(/\s+/g, '-');
                }
                
                // Kiểm tra slug đã tồn tại chưa
                const slugExists = await Category.findOne({ slug: categorySlug });
                
                if (slugExists) {
                    return res.render('admin/category/add', {
                        title: 'Thêm danh mục sản phẩm',
                        error: 'Đường dẫn đã tồn tại, vui lòng chọn đường dẫn khác',
                        user: req.session.user
                    });
                }
                
                // Đường dẫn file ảnh đã tải lên (nếu có)
                let imagePath = null;
                if (req.file) {
                    imagePath = '/uploads/categories/' + req.file.filename;
                }
                
                // Tạo danh mục mới
                const newCategory = new Category({
                    name,
                    description,
                    slug: categorySlug,
                    image: imagePath,
                    active: active === 'on' || active === true
                });
                
                await newCategory.save();
                
                res.redirect('/admin/categories?success=added');
            } catch (error) {
                console.error('Lỗi thêm danh mục:', error);
                
                // Xóa file đã upload nếu có lỗi
                if (req.file) {
                    fs.unlink(req.file.path, err => {
                        if (err) console.error('Lỗi xóa file:', err);
                    });
                }
                
                if (error.name === 'ValidationError') {
                    const messages = Object.values(error.errors).map(val => val.message);
                    return res.render('admin/category/add', {
                        title: 'Thêm danh mục sản phẩm',
                        error: messages[0],
                        user: req.session.user
                    });
                }
                
                return res.render('admin/category/add', {
                    title: 'Thêm danh mục sản phẩm',
                    error: 'Lỗi server, vui lòng thử lại sau',
                    user: req.session.user
                });
            }
        });
    } catch (error) {
        console.error('Lỗi thêm danh mục:', error);
        res.render('admin/category/add', {
            title: 'Thêm danh mục sản phẩm',
            error: 'Lỗi server, vui lòng thử lại sau',
            user: req.session.user
        });
    }
};

// Hiển thị form chỉnh sửa danh mục
exports.getEditCategoryForm = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        
        if (!category) {
            return res.redirect('/admin/categories?error=not-found');
        }
        
        res.render('admin/category/edit', {
            title: 'Chỉnh sửa danh mục sản phẩm',
            category,
            error: null,
            user: req.session.user
        });
    } catch (error) {
        console.error('Lỗi lấy thông tin danh mục:', error);
        res.redirect('/admin/categories?error=not-found');
    }
};

// Cập nhật thông tin danh mục
exports.updateCategory = async (req, res) => {
    try {
        categoryUpload(req, res, async function(err) {
            if (err) {
                return res.render('admin/category/edit', {
                    title: 'Chỉnh sửa danh mục sản phẩm',
                    error: err.message,
                    category: await Category.findById(req.params.id),
                    user: req.session.user
                });
            }

            try {
                const { name, description, slug, currentImage, active } = req.body;
                
                // Kiểm tra danh mục tồn tại
                const category = await Category.findById(req.params.id);
                
                if (!category) {
                    return res.redirect('/admin/categories?error=not-found');
                }
                
                let categorySlug = slug;
                
                // Tạo slug từ tên nếu không có slug
                if (!categorySlug || categorySlug.trim() === '') {
                    categorySlug = name.toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .replace(/đ/g, 'd')
                        .replace(/Đ/g, 'D')
                        .replace(/[^a-z0-9\s]/g, '')
                        .replace(/\s+/g, '-');
                }
                
                // Kiểm tra slug đã tồn tại chưa (nếu thay đổi)
                if (categorySlug !== category.slug) {
                    const slugExists = await Category.findOne({ 
                        slug: categorySlug,
                        _id: { $ne: req.params.id }
                    });
                    
                    if (slugExists) {
                        return res.render('admin/category/edit', {
                            title: 'Chỉnh sửa danh mục sản phẩm',
                            error: 'Đường dẫn đã tồn tại, vui lòng chọn đường dẫn khác',
                            category,
                            user: req.session.user
                        });
                    }
                }
                
                // Đường dẫn file ảnh đã tải lên (nếu có)
                let imagePath = category.image;
                
                if (req.file) {
                    imagePath = '/uploads/categories/' + req.file.filename;
                    
                    // Xóa ảnh cũ nếu có
                    if (category.image && category.image !== '/uploads/categories/default.png') {
                        const oldImagePath = path.join('public', category.image);
                        if (fs.existsSync(oldImagePath)) {
                            fs.unlink(oldImagePath, err => {
                                if (err) console.error('Lỗi xóa file cũ:', err);
                            });
                        }
                    }
                }
                
                // Cập nhật thông tin
                category.name = name;
                category.description = description;
                category.slug = categorySlug;
                category.image = imagePath;
                category.active = active === 'on' || active === true;
                
                await category.save();
                
                res.redirect('/admin/categories?success=updated');
            } catch (error) {
                console.error('Lỗi cập nhật danh mục:', error);
                
                // Xóa file đã upload nếu có lỗi
                if (req.file) {
                    fs.unlink(req.file.path, err => {
                        if (err) console.error('Lỗi xóa file:', err);
                    });
                }
                
                if (error.name === 'ValidationError') {
                    const messages = Object.values(error.errors).map(val => val.message);
                    return res.render('admin/category/edit', {
                        title: 'Chỉnh sửa danh mục sản phẩm',
                        error: messages[0],
                        category: await Category.findById(req.params.id),
                        user: req.session.user
                    });
                }
                
                return res.render('admin/category/edit', {
                    title: 'Chỉnh sửa danh mục sản phẩm',
                    error: 'Lỗi server, vui lòng thử lại sau',
                    category: await Category.findById(req.params.id),
                    user: req.session.user
                });
            }
        });
    } catch (error) {
        console.error('Lỗi cập nhật danh mục:', error);
        res.redirect(`/admin/categories/edit/${req.params.id}?error=server-error`);
    }
};

// Xóa danh mục
exports.deleteCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        
        if (!category) {
            return res.redirect('/admin/categories?error=not-found');
        }
        
        // Xóa ảnh của danh mục nếu có
        if (category.image && category.image !== '/uploads/categories/default.png') {
            const imagePath = path.join('public', category.image);
            if (fs.existsSync(imagePath)) {
                fs.unlink(imagePath, err => {
                    if (err) console.error('Lỗi xóa file:', err);
                });
            }
        }
        
        await category.deleteOne();
        
        res.redirect('/admin/categories?success=deleted');
    } catch (error) {
        console.error('Lỗi xóa danh mục:', error);
        res.redirect('/admin/categories?error=delete-failed');
    }
};

// Xử lý thông số kỹ thuật
const processSpecifications = (specKeys, specValues) => {
    const specifications = {};
    
    if (specKeys && specValues && Array.isArray(specKeys)) {
        specKeys.forEach((key, index) => {
            if (key && specValues[index]) {
                specifications[key] = specValues[index];
            }
        });
    }
    
    return specifications;
};

// Hiển thị danh sách sản phẩm
exports.getProducts = async (req, res) => {
    try {
        const products = await Product.find().populate('category').sort({ createdAt: -1 });
        
        res.render('admin/product/list', {
            title: 'Quản lý sản phẩm',
            user: req.session.user,
            products,
            success: req.query.success,
            error: req.query.error
        });
    } catch (error) {
        console.error('Lỗi lấy danh sách sản phẩm:', error);
        res.status(500).send('Lỗi server');
    }
};

// Hiển thị form thêm sản phẩm
exports.getAddProductForm = async (req, res) => {
    try {
        const categories = await Category.find({ active: true });
        
        res.render('admin/product/add', {
            title: 'Thêm sản phẩm mới',
            user: req.session.user,
            categories,
            error: null
        });
    } catch (error) {
        console.error('Lỗi hiển thị form thêm sản phẩm:', error);
        res.status(500).send('Lỗi server');
    }
};

// Thêm sản phẩm mới
exports.addProduct = async (req, res) => {
    try {
        productUpload.fields([
            { name: 'mainImage', maxCount: 1 },
            { name: 'productImages', maxCount: 5 }
        ])(req, res, async function(err) {
            if (err) {
                const categories = await Category.find({ active: true });
                return res.render('admin/product/add', {
                    title: 'Thêm sản phẩm',
                    error: err.message,
                    user: req.session.user,
                    categories
                });
            }

            try {
                const { 
                    name, 
                    slug, 
                    category, 
                    price, 
                    discountPrice, 
                    quantity, 
                    shortDescription,
                    description,
                    specKeys,
                    specValues,
                    active,
                    featured
                } = req.body;
                
                // Kiểm tra tệp ảnh chính
                if (!req.files.mainImage) {
                    const categories = await Category.find({ active: true });
                    return res.render('admin/product/add', {
                        title: 'Thêm sản phẩm',
                        error: 'Hình ảnh chính là bắt buộc',
                        user: req.session.user,
                        categories
                    });
                }
                
                // Xử lý slug
                let productSlug = slug;
                if (!productSlug || productSlug.trim() === '') {
                    productSlug = name.toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .replace(/đ/g, 'd')
                        .replace(/Đ/g, 'D')
                        .replace(/[^a-z0-9\s]/g, '')
                        .replace(/\s+/g, '-');
                }
                
                // Kiểm tra slug đã tồn tại chưa
                const slugExists = await Product.findOne({ slug: productSlug });
                if (slugExists) {
                    const categories = await Category.find({ active: true });
                    return res.render('admin/product/add', {
                        title: 'Thêm sản phẩm',
                        error: 'Đường dẫn đã tồn tại, vui lòng chọn đường dẫn khác',
                        user: req.session.user,
                        categories
                    });
                }
                
                // Xử lý ảnh chính
                const mainImagePath = '/uploads/products/' + req.files.mainImage[0].filename;
                
                // Xử lý ảnh phụ
                let productImages = [];
                if (req.files.productImages) {
                    productImages = req.files.productImages.map(file => '/uploads/products/' + file.filename);
                }
                
                // Xử lý thông số kỹ thuật
                const specifications = processSpecifications(specKeys, specValues);
                
                // Tạo sản phẩm mới
                const newProduct = new Product({
                    name,
                    slug: productSlug,
                    category,
                    price,
                    discountPrice: discountPrice || 0,
                    quantity,
                    shortDescription,
                    description,
                    mainImage: mainImagePath,
                    images: productImages,
                    specifications,
                    active: active === 'on' || active === true,
                    featured: featured === 'on' || featured === true
                });
                
                await newProduct.save();
                
                res.redirect('/admin/products?success=added');
            } catch (error) {
                console.error('Lỗi thêm sản phẩm:', error);
                
                // Xóa file đã upload nếu có lỗi
                if (req.files.mainImage) {
                    fs.unlink(req.files.mainImage[0].path, err => {
                        if (err) console.error('Lỗi xóa file ảnh chính:', err);
                    });
                }
                
                if (req.files.productImages) {
                    req.files.productImages.forEach(file => {
                        fs.unlink(file.path, err => {
                            if (err) console.error('Lỗi xóa file ảnh phụ:', err);
                        });
                    });
                }
                
                const categories = await Category.find({ active: true });
                
                if (error.name === 'ValidationError') {
                    const messages = Object.values(error.errors).map(val => val.message);
                    return res.render('admin/product/add', {
                        title: 'Thêm sản phẩm',
                        error: messages[0],
                        user: req.session.user,
                        categories
                    });
                }
                
                return res.render('admin/product/add', {
                    title: 'Thêm sản phẩm',
                    error: 'Lỗi server, vui lòng thử lại sau',
                    user: req.session.user,
                    categories
                });
            }
        });
    } catch (error) {
        console.error('Lỗi thêm sản phẩm:', error);
        res.status(500).send('Lỗi server');
    }
};

// Hiển thị form chỉnh sửa sản phẩm
exports.getEditProductForm = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        
        if (!product) {
            return res.redirect('/admin/products?error=not-found');
        }
        
        const categories = await Category.find({ active: true });
        
        res.render('admin/product/edit', {
            title: 'Chỉnh sửa sản phẩm',
            user: req.session.user,
            product,
            categories,
            error: null
        });
    } catch (error) {
        console.error('Lỗi lấy thông tin sản phẩm:', error);
        res.redirect('/admin/products?error=not-found');
    }
};



// ==========================================
// BỔ SUNG CÁC HÀM ADMIN CONTROLLER CÒN THIẾU
// ==========================================

// Cập nhật sản phẩm
exports.updateProduct = async (req, res) => {
    try {
        const { name, category, price, discountPrice, stock, description, featured, active } = req.body;
        const updateData = {
            name,
            category,
            price,
            discountPrice: discountPrice || 0,
            stock: stock || 0,
            description,
            featured: featured === 'on' || featured === true || featured === 'true',
            active: active === 'on' || active === true || active === 'true'
        };
        if (req.files && req.files.length > 0) {
            updateData.images = req.files.map(file => '/uploads/' + file.filename);
        }
        await Product.findByIdAndUpdate(req.params.id, updateData);
        res.redirect('/admin/products?success=updated');
    } catch (error) {
        console.error('Lỗi cập nhật sản phẩm:', error);
        res.redirect(`/admin/products/edit/${req.params.id}?error=update_failed`);
    }
};

// Xóa sản phẩm
exports.deleteProduct = async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.redirect('/admin/products?success=deleted');
    } catch (error) {
        console.error('Lỗi xóa sản phẩm:', error);
        res.redirect('/admin/products?error=delete_failed');
    }
};

// Danh sách mã giảm giá
exports.getCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });
        res.render('admin/coupon/list', {
            title: 'Quản lý mã giảm giá',
            user: req.session.user,
            coupons,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('Lỗi lấy danh sách coupon:', error);
        res.redirect('/admin/dashboard');
    }
};

// Form thêm mã giảm giá
exports.getAddCouponForm = (req, res) => {
    res.render('admin/coupon/add', {
        title: 'Thêm mã giảm giá mới',
        user: req.session.user,
        couponData: {},
        error: null
    });
};

// Thêm mã giảm giá mới
exports.addCoupon = async (req, res) => {
    try {
        const { code, discountType, discountValue, minSpend, maxDiscount, startDate, endDate, usageLimit } = req.body;
        const coupon = new Coupon({
            code: code.toUpperCase(),
            discountType,
            discountValue,
            minSpend: minSpend || 0,
            maxDiscount: maxDiscount || undefined,
            startDate,
            endDate,
            usageLimit: usageLimit || undefined
        });
        await coupon.save();
        res.redirect('/admin/coupons?success=created');
    } catch (error) {
        console.error('Lỗi thêm coupon:', error);
        res.render('admin/coupon/add', {
            title: 'Thêm mã giảm giá mới',
            user: req.session.user,
            couponData: req.body,
            error: error.message || 'Lỗi thêm mã giảm giá'
        });
    }
};

// Form sửa mã giảm giá
exports.getEditCouponForm = async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) return res.redirect('/admin/coupons?error=not-found');
        res.render('admin/coupon/edit', {
            title: 'Chỉnh sửa mã giảm giá',
            user: req.session.user,
            coupon,
            error: null
        });
    } catch (error) {
        console.error('Lỗi xem coupon:', error);
        res.redirect('/admin/coupons');
    }
};

// Cập nhật mã giảm giá
exports.updateCoupon = async (req, res) => {
    try {
        const { code, discountType, discountValue, minSpend, maxDiscount, startDate, endDate, usageLimit, active } = req.body;
        await Coupon.findByIdAndUpdate(req.params.id, {
            code: code ? code.toUpperCase() : undefined,
            discountType,
            discountValue,
            minSpend: minSpend || 0,
            maxDiscount: maxDiscount || undefined,
            startDate,
            endDate,
            usageLimit: usageLimit || undefined,
            active: active === 'on' || active === true || active === 'true'
        });
        res.redirect('/admin/coupons?success=updated');
    } catch (error) {
        console.error('Lỗi cập nhật coupon:', error);
        res.redirect(`/admin/coupons/edit/${req.params.id}?error=update_failed`);
    }
};

// Xóa mã giảm giá
exports.deleteCoupon = async (req, res) => {
    try {
        await Coupon.findByIdAndDelete(req.params.id);
        res.redirect('/admin/coupons?success=deleted');
    } catch (error) {
        console.error('Lỗi xóa coupon:', error);
        res.redirect('/admin/coupons?error=delete_failed');
    }
};

// Quản lý đánh giá
exports.getReviews = async (req, res) => {
    try {
        const filterStatus = req.query.status || 'all';
        const filter = {};
        if (filterStatus !== 'all') {
            filter.status = filterStatus;
        }
        const reviews = await Review.find(filter)
            .populate('user')
            .populate('product')
            .sort({ createdAt: -1 });

        const totalReviews = await Review.countDocuments();
        const pendingCount = await Review.countDocuments({ status: 'pending' });
        const approvedCount = await Review.countDocuments({ status: 'approved' });
        const rejectedCount = await Review.countDocuments({ status: 'rejected' });

        res.render('admin/review/list', {
            title: 'Quản lý đánh giá',
            user: req.session.user,
            reviews,
            totalReviews,
            pendingCount,
            approvedCount,
            rejectedCount,
            filterStatus
        });
    } catch (error) {
        console.error('Lỗi lấy danh sách review:', error);
        res.redirect('/admin/dashboard');
    }
};

// Phê duyệt đánh giá
exports.approveReview = async (req, res) => {
    try {
        await Review.findByIdAndUpdate(req.params.reviewId, { status: 'approved' });
        res.json({ success: true, message: 'Đã phê duyệt đánh giá' });
    } catch (error) {
        console.error('Lỗi duyệt review:', error);
        res.status(500).json({ success: false, message: 'Lỗi duyệt đánh giá' });
    }
};

// Từ chối đánh giá
exports.rejectReview = async (req, res) => {
    try {
        await Review.findByIdAndUpdate(req.params.reviewId, { status: 'rejected' });
        res.json({ success: true, message: 'Đã từ chối đánh giá' });
    } catch (error) {
        console.error('Lỗi từ chối review:', error);
        res.status(500).json({ success: false, message: 'Lỗi từ chối đánh giá' });
    }
};

// Xóa đánh giá
exports.deleteReview = async (req, res) => {
    try {
        await Review.findByIdAndDelete(req.params.reviewId);
        res.json({ success: true, message: 'Đã xóa đánh giá' });
    } catch (error) {
        console.error('Lỗi xóa review:', error);
        res.status(500).json({ success: false, message: 'Lỗi xóa đánh giá' });
    }
};

// Quản lý danh sách đơn hàng
exports.getOrdersList = async (req, res) => {
    try {
        const status = req.query.status;
        const filter = {};
        if (status && status !== 'all') {
            filter.status = status;
        }
        const orders = await Order.find(filter)
            .populate('user')
            .populate('items.product')
            .sort({ createdAt: -1 });

        res.render('admin/order/list', {
            title: 'Quản lý đơn hàng',
            user: req.session.user,
            orders,
            statusFilter: status || 'all',
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('Lỗi lấy danh sách đơn hàng:', error);
        res.redirect('/admin/dashboard');
    }
};

// Chi tiết đơn hàng admin
exports.getOrderDetail = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('user')
            .populate('items.product')
            .populate('coupon');

        if (!order) return res.redirect('/admin/orders?error=not-found');

        res.render('admin/order/detail', {
            title: `Chi tiết đơn hàng #${order.orderCode}`,
            user: req.session.user,
            order
        });
    } catch (error) {
        console.error('Lỗi xem chi tiết đơn hàng:', error);
        res.redirect('/admin/orders');
    }
};

// Form chỉnh sửa đơn hàng
exports.getEditOrder = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('user')
            .populate('items.product');

        if (!order) return res.redirect('/admin/orders?error=not-found');

        res.render('admin/order/edit', {
            title: `Chỉnh sửa đơn hàng #${order.orderCode}`,
            user: req.session.user,
            order,
            error: null
        });
    } catch (error) {
        console.error('Lỗi trang sửa đơn hàng:', error);
        res.redirect('/admin/orders');
    }
};

// Cập nhật trạng thái đơn hàng
exports.updateOrder = async (req, res) => {
    try {
        const { status, paymentStatus, adminNote, trackingCode } = req.body;
        await Order.findByIdAndUpdate(req.params.id, {
            status,
            paymentStatus,
            adminNote,
            trackingCode
        });
        res.redirect('/admin/orders?success=updated');
    } catch (error) {
        console.error('Lỗi cập nhật đơn hàng:', error);
        res.redirect(`/admin/orders/edit/${req.params.id}?error=update_failed`);
    }
};

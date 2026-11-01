const express = require('express');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/db');
const session = require('express-session');
require('dotenv').config();

// Routes
const clientRoutes = require('./routes/clientRoutes');
const adminRoutes = require('./routes/adminRoutes');
const authRoutes = require('./routes/authRoutes');

// Import Controller cho middleware - đảm bảo phương thức tồn tại
const authController = require('./controllers/authController');
const adminController = require('./controllers/adminController');
const clientController = require('./controllers/clientController');

// Khởi tạo Express app
const app = express();

// Kết nối database khi khởi tạo
connectDB();

// Middleware đảm bảo kết nối DB cho mỗi request (đặc biệt quan trọng trên serverless)
app.use(async (req, res, next) => {
    try {
        await connectDB();
    } catch (err) {
        console.error('Lỗi kết nối DB trong middleware:', err.message);
    }
    next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cấu hình session
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } 
}));

// Set view engine - hỗ trợ cả local và Netlify Functions packaging
app.set('view engine', 'ejs');
const viewsPath = fs.existsSync(path.join(__dirname, 'views'))
    ? path.join(__dirname, 'views')
    : path.join(process.cwd(), 'views');
app.set('views', viewsPath);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));


// Middleware để lấy thông tin người dùng hiện tại
if (typeof authController.getCurrentUser === 'function') {
    app.use(authController.getCurrentUser);
}

// Middleware để lấy danh sách danh mục cho tất cả các trang
if (typeof adminController.categoryMiddleware === 'function') {
    app.use(adminController.categoryMiddleware);
}

// Middleware để lấy thông tin giỏ hàng
if (typeof clientController.cartMiddleware === 'function') {
    app.use(clientController.cartMiddleware);
}

// Routes
app.use('/', clientRoutes);
app.use('/admin', adminRoutes);
app.use('/auth', authRoutes);

// Xử lý Error 404
app.use((req, res) => {
    res.status(404).render('404', { 
        title: 'Không tìm thấy trang',
        user: req.session ? req.session.user : null,
        categories: res.locals.categories || []
    });
});

// Chỉ lắng nghe PORT khi chạy trực tiếp file này (local hoặc traditional hosting)
// Khi được require bởi Netlify Serverless Functions, không khởi động listener
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server đang chạy trên port http://localhost:${PORT}`);
    });
}

module.exports = app;

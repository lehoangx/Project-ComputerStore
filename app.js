const express = require('express');
const path = require('path');
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

// Kết nối database
connectDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cấu hình session
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } 
}));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


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
        user: req.session.user,
        categories: res.locals.categories || []
    });
});

// Port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server đang chạy trên port http://localhost:${PORT}`);
});

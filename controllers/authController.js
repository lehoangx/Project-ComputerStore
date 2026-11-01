const User = require('../models/User');
const crypto = require('crypto');
const transporter = require('../utils/mailer');
const PORT = process.env.PORT;
const BASE_URL = `http://localhost:${PORT}`;

// @desc    Hiển thị form đăng ký
// @route   GET /auth/register
// @access  Public
exports.getRegisterForm = (req, res) => {
  res.render('auth/register', {
    title: 'Đăng ký tài khoản'
  });
};

// @desc    Xử lý đăng ký người dùng
// @route   POST /auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { name, email, phone, address, city, district, ward, password, confirmPassword } = req.body;

    // Kiểm tra mật khẩu và mật khẩu xác nhận
    if (password !== confirmPassword) {
      return res.render('auth/register', { 
        title: 'Đăng ký tài khoản',
        error: 'Mật khẩu xác nhận không khớp',
        name,
        email,
        phone,
        address,
        city,
        district,
        ward
      });
    }

    // Kiểm tra email đã tồn tại chưa
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.render('auth/register', { 
        title: 'Đăng ký tài khoản',
        error: 'Email đã được sử dụng',
        name,
        email,
        phone,
        address,
        city,
        district,
        ward
      });
    }

    // Tạo user mới (chưa xác thực)
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const user = await User.create({
      name,
      email,
      phone,
      address,
      city,
      district,
      ward,
      password,
      isVerified: false,
      verifyToken
    });

    // Gửi email xác thực
    const verifyUrl = `${BASE_URL}/auth/verify-email?token=${verifyToken}&email=${encodeURIComponent(email)}`;
    try {
      await transporter.sendMail({
        from: 'nguyentung11122003@gmail.com',
        to: email,
        subject: 'Xác thực tài khoản ThinkPro',
        html: `<h3>Chào mừng bạn đến với ThinkPro!</h3><p>Vui lòng xác thực tài khoản bằng cách bấm vào link sau:</p><a href="${verifyUrl}">${verifyUrl}</a>`
      });
    } catch (mailErr) {
      console.log(`[SMTP CHƯA CẤU HÌNH] Link xác thực tài khoản: ${verifyUrl}`);
      // Tự động kích hoạt tài khoản để hỗ trợ test khi không có SMTP
      user.isVerified = true;
      await user.save();
    }

    return res.render('auth/login', {
      title: 'Đăng nhập',
      registered: false,
      verifyNotice: true,
      email
    });
  } catch (error) {
    console.error('Lỗi đăng ký:', error);
    
    // Xử lý lỗi validation từ mongoose
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.render('auth/register', { 
        title: 'Đăng ký tài khoản',
        error: messages[0],
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone,
        address: req.body.address,
        city: req.body.city,
        district: req.body.district,
        ward: req.body.ward
      });
    }

    return res.render('auth/register', { 
      title: 'Đăng ký tài khoản',
      error: 'Lỗi server, vui lòng thử lại sau',
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      address: req.body.address,
      city: req.body.city,
      district: req.body.district,
      ward: req.body.ward
    });
  }
};

// @desc    Hiển thị form đăng nhập
// @route   GET /auth/login
// @access  Public
exports.getLoginForm = (req, res) => {
  // Kiểm tra nếu có thông báo đăng ký thành công
  const registered = req.query.registered;
  const reset = req.query.reset;
  
  res.render('auth/login', {
    title: 'Đăng nhập',
    registered: registered === 'true',
    reset: reset === 'true'
  });
};

// @desc    Xử lý đăng nhập
// @route   POST /auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Kiểm tra email tồn tại
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.render('auth/login', {
        title: 'Đăng nhập',
        error: 'Email hoặc mật khẩu không đúng',
        email
      });
    }

    // Kiểm tra xác thực email
    if (!user.isVerified) {
      return res.render('auth/login', {
        title: 'Đăng nhập',
        error: 'Tài khoản chưa xác thực email. Vui lòng kiểm tra email để xác thực.',
        email,
        verifyNotice: true
      });
    }

    // Kiểm tra mật khẩu
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.render('auth/login', {
        title: 'Đăng nhập',
        error: 'Email hoặc mật khẩu không đúng',
        email
      });
    }

    // Tạo session đăng nhập (đơn giản)
    req.session.user = {
      _id: user._id,
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    // Nếu là admin, chuyển đến trang admin
    if (user.role === 'admin') {
      return res.redirect('/admin/dashboard');
    }

    // Nếu là user thường, chuyển đến trang chủ
    return res.redirect('/');
  } catch (error) {
    console.error('Lỗi đăng nhập:', error);
    return res.render('auth/login', {
      title: 'Đăng nhập',
      error: 'Lỗi server, vui lòng thử lại sau',
      email: req.body.email
    });
  }
};

// @desc    Hiển thị form quên mật khẩu (bước 1: nhập email)
// @route   GET /auth/forgot-password
// @access  Public
exports.getForgotPasswordForm = (req, res) => {
  res.render('auth/forgot-password', {
    title: 'Quên mật khẩu'
  });
};

// @desc    Xử lý yêu cầu quên mật khẩu (bước 1: gửi email reset)
// @route   POST /auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.render('auth/forgot-password', {
        title: 'Quên mật khẩu',
        error: 'Email không tồn tại trong hệ thống',
        email
      });
    }
    // Tạo token reset
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 1000 * 60 * 30; // 30 phút
    await user.save();
    // Gửi email reset
    const resetUrl = `${BASE_URL}/auth/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
    try {
      await transporter.sendMail({
        from: 'nguyentung11122003@gmail.com',
        to: email,
        subject: 'Đặt lại mật khẩu ThinkPro',
        html: `<h3>Yêu cầu đặt lại mật khẩu</h3><p>Bấm vào link sau để đặt lại mật khẩu (có hiệu lực trong 30 phút):</p><a href="${resetUrl}">${resetUrl}</a>`
      });
    } catch (mailErr) {
      console.log(`[SMTP CHƯA CẤU HÌNH] Link đặt lại mật khẩu: ${resetUrl}`);
    }
    return res.render('auth/forgot-password', {
      title: 'Quên mật khẩu',
      message: 'Đã tạo yêu cầu đặt lại mật khẩu. Vui lòng kiểm tra hộp thư (hoặc link trên server console).'
    });
  } catch (error) {
    console.error('Lỗi xác nhận email:', error);
    return res.render('auth/forgot-password', {
      title: 'Quên mật khẩu',
      error: 'Lỗi server, vui lòng thử lại sau',
      email: req.body.email
    });
  }
};

// @desc    Hiển thị form đổi mật khẩu qua link token
// @route   GET /auth/reset-password
// @access  Public
exports.getResetPasswordForm = async (req, res) => {
  const { token, email } = req.query;
  const user = await User.findOne({ email, resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } });
  if (!user) {
    return res.render('auth/forgot-password', { title: 'Quên mật khẩu', error: 'Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.' });
  }
  return res.render('auth/reset-password', { title: 'Đặt lại mật khẩu', email, token });
};

// @desc    Xử lý đổi mật khẩu qua link token
// @route   POST /auth/reset-password
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const { email, token, newPassword, confirmPassword } = req.body;
    if (newPassword !== confirmPassword) {
      return res.render('auth/reset-password', { title: 'Đặt lại mật khẩu', error: 'Mật khẩu xác nhận không khớp', email, token });
    }
    const user = await User.findOne({ email, resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } }).select('+password');
    if (!user) {
      return res.render('auth/forgot-password', { title: 'Quên mật khẩu', error: 'Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.' });
    }
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    return res.render('auth/login', { title: 'Đăng nhập', reset: true });
  } catch (error) {
    console.error('Lỗi đổi mật khẩu:', error);
    return res.render('auth/reset-password', {
      title: 'Đổi mật khẩu',
      error: 'Lỗi server, vui lòng thử lại sau',
      email: req.body.email
    });
  }
};

// @desc    Đăng xuất
// @route   GET /auth/logout
// @access  Private
exports.logout = (req, res) => {
    // Xóa session
    req.session.destroy((err) => {
        if (err) {
            console.error('Lỗi khi đăng xuất:', err);
            return res.status(500).send('Lỗi server');
        }
        
        // Chuyển hướng về trang chủ
        res.redirect('/');
    });
};

// Middleware để kiểm tra và thiết lập thông tin người dùng hiện tại
exports.getCurrentUser = (req, res, next) => {
  // Gán thông tin người dùng từ session vào locals để view có thể truy cập
  res.locals.user = req.session && req.session.user ? req.session.user : null;
  next();
};

// @desc    Xác thực email
// @route   GET /auth/verify-email
// @access  Public
exports.verifyEmail = async (req, res) => {
  const { token, email } = req.query;
  const user = await User.findOne({ email, verifyToken: token });
  if (!user) {
    return res.render('auth/login', { title: 'Đăng nhập', error: 'Link xác thực không hợp lệ hoặc đã hết hạn.' });
  }
  user.isVerified = true;
  user.verifyToken = undefined;
  await user.save();
  return res.render('auth/login', { title: 'Đăng nhập', verified: true });
};

// @desc    Gửi lại email xác thực
// @route   POST /auth/resend-verification
// @access  Public
exports.resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.render('auth/login', {
        title: 'Đăng nhập',
        error: 'Email không tồn tại trong hệ thống',
        email
      });
    }

    if (user.isVerified) {
      return res.render('auth/login', {
        title: 'Đăng nhập',
        error: 'Tài khoản đã được xác thực',
        email
      });
    }

    // Tạo token xác thực mới
    const verifyToken = crypto.randomBytes(32).toString('hex');
    user.verifyToken = verifyToken;
    await user.save();

    // Gửi email xác thực
    const verifyUrl = `${BASE_URL}/auth/verify-email?token=${verifyToken}&email=${encodeURIComponent(email)}`;
    try {
      await transporter.sendMail({
        from: 'nguyentung11122003@gmail.com',
        to: email,
        subject: 'Xác thực tài khoản ThinkPro',
        html: `<h3>Chào mừng bạn đến với ThinkPro!</h3><p>Vui lòng xác thực tài khoản bằng cách bấm vào link sau:</p><a href="${verifyUrl}">${verifyUrl}</a>`
      });
    } catch (mailErr) {
      console.log(`[SMTP CHƯA CẤU HÌNH] Link xác thực tài khoản: ${verifyUrl}`);
      // Tự động kích hoạt tài khoản để hỗ trợ test khi không có SMTP
      user.isVerified = true;
      await user.save();
    }

    return res.render('auth/login', {
      title: 'Đăng nhập',
      message: 'Đã gửi lại email xác thực. Vui lòng kiểm tra hộp thư.',
      email
    });
  } catch (error) {
    console.error('Lỗi gửi lại email xác thực:', error);
    return res.render('auth/login', {
      title: 'Đăng nhập',
      error: 'Lỗi server, vui lòng thử lại sau',
      email: req.body.email
    });
  }
}; 




const mongoose = require('mongoose');

// Hàm kết nối đến cơ sở dữ liệu MongoDB
const connectDB = async () => {
  // Tái sử dụng kết nối nếu đã sẵn sàng (rất quan trọng trên serverless)
  if (mongoose.connection && mongoose.connection.readyState >= 1) {
    return mongoose.connection;
  }

  try {
    const connectionString = process.env.MONGO_URI;
    if (!connectionString) {
      console.warn('⚠️ Cảnh báo: Biến môi trường MONGO_URI chưa được thiết lập.');
      return null;
    }

    // Kết nối đến MongoDB
    const conn = await mongoose.connect(connectionString, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 8000
    });
    
    console.log(`✓ MongoDB đã kết nối: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`✗ Lỗi kết nối MongoDB: ${error.message}`);
    // Không gọi process.exit(1) trên serverless vì sẽ làm crash container lambda
  }
};

module.exports = connectDB;

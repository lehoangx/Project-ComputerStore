const serverless = require('serverless-http');
const app = require('../../app');

const serverlessHandler = serverless(app);

exports.handler = async (event, context) => {
  // Tránh Lambda timeout do Mongoose giữ kết nối socket mở trong event loop
  context.callbackWaitsForEmptyEventLoop = false;

  // Chuẩn hóa đường dẫn khi Netlify redirect qua /.netlify/functions/api
  if (event.path && event.path.startsWith('/.netlify/functions/api')) {
    event.path = event.path.replace('/.netlify/functions/api', '') || '/';
  }

  return await serverlessHandler(event, context);
};

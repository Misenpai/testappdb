const app = require('./src/app');
const connectDB = require('./src/config/database');

const PORT = process.env.PORT || 3000;


connectDB();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
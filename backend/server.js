const dotenv = require('dotenv');

dotenv.config();

const connectDB = require('./config/db');
const app = require('./app');
const { startCronJobs } = require('./jobs/cronJobs');

connectDB();
startCronJobs();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

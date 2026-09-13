const dotenv = require('dotenv');

dotenv.config();

// Error monitoring first, so anything the rest of the boot throws is seen.
require('./utils/monitoring').init();

const connectDB = require('./config/db');
const app = require('./app');
const { startCronJobs } = require('./jobs/cronJobs');

connectDB().then(() => require('./config/sellerRules').loadRules());
startCronJobs();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

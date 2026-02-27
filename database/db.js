const mongoose = require('mongoose');

const database = async () => {
  try {
    await mongoose.connect(process.env.DB_URL);
    console.log("MongoDB Atlas Connected Successfully");
  } catch (error) {
    console.error("MongoDB Connection Error:", error.message);
    process.exit(1);
  }
};

module.exports = database;
const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema({
  title: String,
  company: String,
  location: String,
  skills: [String],
  url: { type: "string" },
  matchScore: Number, // how well it matches your resume
  savedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Job", jobSchema);

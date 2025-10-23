// backend/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Promptle backend is running!");
});

// placeholder API route
app.get("/api/prompt", (req, res) => {
  res.json({ prompt: "Describe a sunrise using three adjectives." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

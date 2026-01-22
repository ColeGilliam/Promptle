// app.js
import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/api.js';

const app = express();

app.use(cors());
app.use(express.json());

// Attach routes
app.use('/', apiRoutes); // Or '/api' if you want to prefix

export default app;
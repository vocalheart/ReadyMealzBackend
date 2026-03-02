
const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const app = express();
const cookieParser = require('cookie-parser');
const cors = require('cors');
// Routes
const AdminAuthController = require('./AdminMangement/routes/routes');
const UserAuthController = require('./routes/routes')
const ProfileController = require('./UserMangement/user.routes.js')

//database
const database  = require('./database/db');
database();
// origgin 
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3001', 
        'https://www.readymealz.in', 'https://adminpannelready-mealz.vercel.app', 'https://admin.readymealz.in'],
    methods: ["GET", "POST", "PUT", "PATCH", "OPTION"],
    credentials: true,
}));

// Middleware // IMPORTANT
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // IMPORTANT
app.use(cookieParser()); // must for cookies
// API Routes
app.use('/api', AdminAuthController);
app.use('/api/user', UserAuthController);
app.use('/api/user',  ProfileController);
  

app.get('/api' , ( req , res)=>{
    res.status(200).json("Your servers running on prot 5000")
});

// Server
const PORT = process.env.PORT || 5000;
//
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
});














const mongoose = require('mongoose');


const Category = new mongoose.Schema({
    name: {type: String , required: true , unique: true, trim: true},
    slug: {type:String , required: true,  unique: true, lowercase: true},
    description: {type: String , default: ""},
},
{timestamps: true}
)

const   CategorySchema = mongoose.model('Category' , Category)

module.exports = CategorySchema
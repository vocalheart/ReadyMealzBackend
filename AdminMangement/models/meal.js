const mongoose = require("mongoose");

/* ================= IMAGE SCHEMA ================= */
const imageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: [true, 'Image URL is required'],
      trim: true
    },
    key: {
      type: String,
      required: [true, 'Image key is required'],
      trim: true
    },
    altText: {
      type: String,
      trim: true,
      default: ''
    },
    isMainImage: {
      type: Boolean,
      default: false
    }
  },
  { _id: true }
);

/* ================= MEAL SCHEMA ================= */
const mealSchema = new mongoose.Schema(
  {
    /* BASIC INFO */
    name: {
      type: String,
      required: [true, 'Meal name is required'],
      trim: true,
      minlength: [2, 'Meal name must be at least 2 characters'],
      maxlength: [100, 'Meal name cannot exceed 100 characters']
    },

    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      sparse: true
      // Generate from name before save if not provided
    },

    description: {
      type: String,
      default: "",
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
      trim: true
    },

    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative']
    },

    /* DISCOUNT SYSTEM */
    discountPercentage: {
      type: Number,
      default: 0,
      min: [0, 'Discount cannot be less than 0%'],
      max: [100, 'Discount cannot exceed 100%']
    },

    discountPrice: {
      type: Number,
      default: 0,
      min: [0, 'Discount price cannot be negative'],
      validate: {
        validator: function(value) {
          return value < this.price;
        },
        message: 'Discount price must be less than original price'
      }
    },

    discountExpiry: {
      type: Date,
      default: null
    },

    /* CATEGORY & RELATIONS */
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true
    },

    foodType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FoodType",
      default: null,
      index: true
    },

    tags: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tags"
      }
    ],

    /* IMAGES */
    images: {
      type: [imageSchema],
      validate: {
        validator: function(images) {
          return images.length > 0 || !this.isActive;
        },
        message: 'At least one image is required for active meals'
      }
    },

    /* AVAILABILITY */
    isAvailable: {
      type: Boolean,
      default: true,
      index: true
    },

    isFeatured: {
      type: Boolean,
      default: false,
      index: true
    },

    status: {
      type: String,
      enum: {
        values: ['active', 'inactive', 'out_of_stock'],
        message: 'Invalid status'
      },
      default: "active",
      index: true
    },

    /* STOCK CONTROL */
    stock: {
      type: Number,
      default: 0,
      min: [0, 'Stock cannot be negative']
    },

    isUnlimitedStock: {
      type: Boolean,
      default: true
    },

    lowStockThreshold: {
      type: Number,
      default: 5,
      min: 0
    },

    /* RATING SYSTEM */
    averageRating: {
      type: Number,
      default: 0,
      min: [0, 'Rating cannot be less than 0'],
      max: [5, 'Rating cannot exceed 5']
    },

    totalReviews: {
      type: Number,
      default: 0,
      min: 0
    },

    ratingBreakdown: {
      five: { type: Number, default: 0 },
      four: { type: Number, default: 0 },
      three: { type: Number, default: 0 },
      two: { type: Number, default: 0 },
      one: { type: Number, default: 0 }
    },

    /* PREPARATION INFO */
    preparationTime: {
      type: Number, // in minutes
      default: 0,
      min: [0, 'Preparation time cannot be negative']
    },

    servingSize: {
      type: String,
      default: "",
      trim: true
    },

    servingsPerItem: {
      type: Number,
      default: 1,
      min: [1, 'Servings must be at least 1']
    },

    /* NUTRITION INFO (Per serving) */
    nutrition: {
      calories: {
        type: Number,
        default: 0,
        min: 0
      },
      protein: {
        type: Number,
        default: 0,
        min: 0
      },
      carbs: {
        type: Number,
        default: 0,
        min: 0
      },
      fat: {
        type: Number,
        default: 0,
        min: 0
      },
      fiber: {
        type: Number,
        default: 0,
        min: 0
      },
      sodium: {
        type: Number,
        default: 0,
        min: 0
      }
    },

    /* ALLERGENS & DIETARY */
    allergens: [
      {
        type: String,
        enum: ['peanuts', 'tree_nuts', 'milk', 'eggs', 'fish', 'shellfish', 'wheat', 'soy', 'sesame'],
        trim: true
      }
    ],

    dietaryFlags: [
      {
        type: String,
        enum: ['vegan', 'vegetarian', 'gluten_free', 'dairy_free', 'spicy', 'low_calorie'],
        trim: true
      }
    ],

    /* SOFT DELETE */
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },

    /* CREATED BY */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    },

    /* METADATA */
    totalSalesCount: {
      type: Number,
      default: 0,
      min: 0
    },

    lastRestocked: {
      type: Date,
      default: null
    },

    visibility: {
      type: String,
      enum: ['public', 'private', 'hidden'],
      default: 'public',
      index: true
    }
  },
  {
    timestamps: true,
    collection: 'meals'
  }
);

/* ================= INDEXES ================= */
mealSchema.index({ name: "text", description: "text" });
mealSchema.index({ slug: 1 }, { unique: true, sparse: true });
mealSchema.index({ category: 1, isDeleted: 1 });
mealSchema.index({ foodType: 1, isDeleted: 1 });
mealSchema.index({ status: 1, isDeleted: 1 });
mealSchema.index({ isFeatured: 1, isDeleted: 1 });
mealSchema.index({ isAvailable: 1, isDeleted: 1 });
mealSchema.index({ createdAt: -1 });
mealSchema.index({ averageRating: -1 });

/* ================= PRE-SAVE MIDDLEWARE ================= */
mealSchema.pre('save', function(next) {
  // Generate slug from name if not provided
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  // Update status based on stock
  if (!this.isUnlimitedStock && this.stock === 0) {
    this.status = 'out_of_stock';
    this.isAvailable = false;
  }

  // Calculate discountPrice if discountPercentage is set
  if (this.discountPercentage > 0) {
    this.discountPrice = this.price - (this.price * this.discountPercentage / 100);
  }

  // Trim whitespace from arrays
  if (this.allergens) {
    this.allergens = this.allergens.map(item => item.trim());
  }
  if (this.dietaryFlags) {
    this.dietaryFlags = this.dietaryFlags.map(item => item.trim());
  }

  next();
});

/* ================= QUERY HELPERS ================= */
mealSchema.query.active = function() {
  return this.where({ status: 'active', isDeleted: false });
};

mealSchema.query.available = function() {
  return this.where({ isAvailable: true, isDeleted: false });
};

mealSchema.query.featured = function() {
  return this.where({ isFeatured: true, isDeleted: false });
};

mealSchema.query.byCategory = function(categoryId) {
  return this.where({ category: categoryId, isDeleted: false });
};

/* ================= INSTANCE METHODS ================= */
mealSchema.methods.getEffectivePrice = function() {
  if (this.discountPercentage > 0 && (!this.discountExpiry || this.discountExpiry > new Date())) {
    return this.discountPrice;
  }
  return this.price;
};

mealSchema.methods.getSavings = function() {
  if (this.discountPercentage > 0) {
    return this.price - this.discountPrice;
  }
  return 0;
};

mealSchema.methods.isLowOnStock = function() {
  return !this.isUnlimitedStock && this.stock <= this.lowStockThreshold;
};

mealSchema.methods.getFormattedNutrition = function() {
  return {
    calories: this.nutrition.calories,
    protein: `${this.nutrition.protein}g`,
    carbs: `${this.nutrition.carbs}g`,
    fat: `${this.nutrition.fat}g`,
    fiber: `${this.nutrition.fiber}g`,
    sodium: `${this.nutrition.sodium}mg`
  };
};

mealSchema.methods.canBePurchased = function() {
  return this.isAvailable && this.status === 'active' && !this.isDeleted && 
         (this.isUnlimitedStock || this.stock > 0);
};

mealSchema.methods.updateRating = function(newRating) {
  // newRating should be 1-5
  if (newRating < 1 || newRating > 5) return;

  // Update breakdown
  switch(newRating) {
    case 5: this.ratingBreakdown.five++; break;
    case 4: this.ratingBreakdown.four++; break;
    case 3: this.ratingBreakdown.three++; break;
    case 2: this.ratingBreakdown.two++; break;
    case 1: this.ratingBreakdown.one++; break;
  }

  // Recalculate average rating
  this.totalReviews++;
  const totalRating = 
    (this.ratingBreakdown.five * 5) +
    (this.ratingBreakdown.four * 4) +
    (this.ratingBreakdown.three * 3) +
    (this.ratingBreakdown.two * 2) +
    (this.ratingBreakdown.one * 1);

  this.averageRating = parseFloat((totalRating / this.totalReviews).toFixed(2));
};

/* ================= STATIC METHODS ================= */
mealSchema.statics.getTopRated = function(limit = 10) {
  return this.find({ isDeleted: false, status: 'active' })
    .sort({ averageRating: -1 })
    .limit(limit);
};

mealSchema.statics.getFeatured = function(limit = 10) {
  return this.find({ isFeatured: true, isDeleted: false })
    .sort({ createdAt: -1 })
    .limit(limit);
};

mealSchema.statics.searchByName = function(searchTerm) {
  return this.find(
    { $text: { $search: searchTerm }, isDeleted: false },
    { score: { $meta: "textScore" } }
  ).sort({ score: { $meta: "textScore" } });
};

module.exports = mongoose.model("Meal", mealSchema);
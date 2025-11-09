import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Trust proxy for Vercel/serverless environments
app.set("trust proxy", 1);

/* 
=========================================================================================
                        CONFIGURATION & MIDDLEWARE
=========================================================================================
*/

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

console.log("☁️  Cloudinary Config:", {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY ? "✓ Set" : "✗ Missing",
  api_secret: process.env.CLOUDINARY_API_SECRET ? "✓ Set" : "✗ Missing",
});

// CORS Configuration - Simplified for Vercel
// This allows all origins to prevent deployment issues
app.use(
  cors({
    origin: true, // Reflects the request origin, allowing all
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    optionsSuccessStatus: 204,
  })
);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Multer Configuration
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 5, // Maximum 5 files per request
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Invalid file type: ${file.mimetype}. Only images are allowed.`
        )
      );
    }
  },
});

// MongoDB Connection with retry logic
const connectDB = async (retries = 5) => {
  try {
    const options = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    await mongoose.connect(process.env.MONGODB_URI, options);
    console.log("✅ Successfully connected to MongoDB!");

    // MongoDB connection event listeners
    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️  MongoDB disconnected. Attempting to reconnect...");
    });

    mongoose.connection.on("reconnected", () => {
      console.log("✅ MongoDB reconnected!");
    });
  } catch (error) {
    console.error(
      `❌ MongoDB connection error (${retries} retries left):`,
      error.message
    );

    if (retries > 0) {
      console.log(`Retrying in 5 seconds...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return connectDB(retries - 1);
    } else {
      console.error("❌ Failed to connect to MongoDB after multiple retries");
      process.exit(1);
    }
  }
};

connectDB();

/* 
=========================================================================================
                        MODELS
=========================================================================================
*/

// Category Model
const categorySchema = new mongoose.Schema(
  {
    categoryName: {
      type: String,
      required: [true, "Category name is required"],
      unique: true,
      trim: true,
      minlength: [3, "Category name must be at least 3 characters"],
      maxlength: [50, "Category name must not exceed 50 characters"],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      index: true,
    },
    articleCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index for faster queries
categorySchema.index({ categoryName: 1 });

categorySchema.pre("save", function (next) {
  if (this.isModified("categoryName")) {
    this.slug = this.categoryName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }
  next();
});

const Category = mongoose.model("Category", categorySchema);

// Article Model
const articleSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
      index: true,
    },
    avatar: {
      type: String,
      required: [true, "Avatar is required"],
    },
    avatarPublicId: String,
    img: {
      type: String,
      required: [true, "Image is required"],
    },
    imgPublicId: String,
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      minlength: [5, "Title must be at least 5 characters"],
      maxlength: [200, "Title must not exceed 200 characters"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      minlength: [20, "Description must be at least 20 characters"],
      maxlength: [1000, "Description must not exceed 1000 characters"],
    },
    code: {
      type: String,
      required: [true, "Code is required"],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      index: true,
    },
    views: {
      type: Number,
      default: 0,
      min: 0,
    },
    likes: {
      type: Number,
      default: 0,
      min: 0,
    },
    likedBy: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for better query performance
articleSchema.index({ title: "text", description: "text" });
articleSchema.index({ category: 1, createdAt: -1 });
articleSchema.index({ views: -1 });
articleSchema.index({ likes: -1 });

articleSchema.pre("save", function (next) {
  if (this.isModified("title")) {
    const timestamp = Date.now();
    this.slug =
      this.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") + `-${timestamp}`;
  }
  next();
});

const Article = mongoose.model("Article", articleSchema);

// Comment Model
const commentSchema = new mongoose.Schema(
  {
    articleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Article",
      required: true,
      index: true,
    },
    user: {
      type: String,
      required: [true, "User name is required"],
      trim: true,
      minlength: [2, "User name must be at least 2 characters"],
      maxlength: [50, "User name must not exceed 50 characters"],
    },
    text: {
      type: String,
      required: [true, "Comment text is required"],
      trim: true,
      minlength: [1, "Comment must not be empty"],
      maxlength: [1000, "Comment must not exceed 1000 characters"],
    },
    likes: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

commentSchema.index({ articleId: 1, createdAt: -1 });

const Comment = mongoose.model("Comment", commentSchema);

// Project Model
const projectSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      minlength: [3, "Title must be at least 3 characters"],
      maxlength: [200, "Title must not exceed 200 characters"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      minlength: [10, "Description must be at least 10 characters"],
      maxlength: [500, "Description must not exceed 500 characters"],
    },
    fullDescription: {
      type: String,
      required: [true, "Full description is required"],
    },
    image: {
      type: String,
      required: [true, "Image is required"],
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      index: true,
    },
    technologies: {
      type: [String],
      default: [],
    },
    github: String,
    demo: String,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

projectSchema.index({ title: "text", description: "text" });
projectSchema.index({ category: 1, createdAt: -1 });

const Project = mongoose.model("Project", projectSchema);

/* 
=========================================================================================
                        HELPER FUNCTIONS
=========================================================================================
*/

const uploadToCloudinary = (fileBuffer, folder = "articles") => {
  return new Promise((resolve, reject) => {
    if (!fileBuffer) {
      return reject(new Error("File buffer is required"));
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto",
        transformation: [{ quality: "auto:good" }, { fetch_format: "auto" }],
      },
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          reject(new Error(`Cloudinary upload failed: ${error.message}`));
        } else {
          resolve(result);
        }
      }
    );
    uploadStream.end(fileBuffer);
  });
};

const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return;

  try {
    await cloudinary.uploader.destroy(publicId);
    console.log(`✅ Deleted image: ${publicId}`);
  } catch (error) {
    console.error(`❌ Failed to delete image ${publicId}:`, error.message);
  }
};

const formatTimeAgo = (date) => {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  const intervals = [
    { label: "year", seconds: 31536000 },
    { label: "month", seconds: 2592000 },
    { label: "day", seconds: 86400 },
    { label: "hour", seconds: 3600 },
    { label: "min", seconds: 60 },
  ];

  for (const { label, seconds: intervalSeconds } of intervals) {
    const interval = Math.floor(seconds / intervalSeconds);
    if (interval >= 1) {
      return `${interval} ${label}${interval > 1 ? "s" : ""} ago`;
    }
  }
  return "just now";
};

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const validateObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

const sanitizeInput = (input) => {
  if (typeof input === "string") {
    return input.trim().replace(/[<>]/g, "");
  }
  return input;
};

/* 
=========================================================================================
                        CATEGORY ROUTES
=========================================================================================
*/

// Create Category
app.post(
  "/api/categories",
  asyncHandler(async (req, res) => {
    const { categoryName } = req.body;

    if (!categoryName || !categoryName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    const sanitizedName = sanitizeInput(categoryName);

    const existingCategory = await Category.findOne({
      categoryName: { $regex: new RegExp(`^${sanitizedName}$`, "i") },
    });

    if (existingCategory) {
      return res.status(409).json({
        success: false,
        message: "Category already exists",
      });
    }

    const category = await Category.create({ categoryName: sanitizedName });

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: category,
    });
  })
);

// Get All Categories
app.get(
  "/api/categories",
  asyncHandler(async (req, res) => {
    const categories = await Category.find()
      .sort({ createdAt: -1 })
      .lean()
      .select("-__v");

    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
    });
  })
);

// Get Single Category
app.get(
  "/api/categories/:id",
  asyncHandler(async (req, res) => {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID format",
      });
    }

    const category = await Category.findById(req.params.id).lean();

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    res.status(200).json({
      success: true,
      data: category,
    });
  })
);

// Update Category
app.put(
  "/api/categories/:id",
  asyncHandler(async (req, res) => {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID format",
      });
    }

    const { categoryName } = req.body;

    if (!categoryName || !categoryName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    const sanitizedName = sanitizeInput(categoryName);

    const existingCategory = await Category.findOne({
      categoryName: { $regex: new RegExp(`^${sanitizedName}$`, "i") },
      _id: { $ne: req.params.id },
    });

    if (existingCategory) {
      return res.status(409).json({
        success: false,
        message: "Category name already exists",
      });
    }

    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { categoryName: sanitizedName },
      { new: true, runValidators: true }
    );

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: category,
    });
  })
);

// Delete Category
app.delete(
  "/api/categories/:id",
  asyncHandler(async (req, res) => {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID format",
      });
    }

    const category = await Category.findByIdAndDelete(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Category deleted successfully",
    });
  })
);

/* 
=========================================================================================
                        ARTICLE ROUTES
=========================================================================================
*/

// Get Most Viewed Articles (MUST come before /:id route)
app.get(
  "/api/articles/most-viewed",
  asyncHandler(async (req, res) => {
    const { limit = 10 } = req.query;

    const articles = await Article.find()
      .sort({ views: -1 })
      .limit(Math.min(+limit, 50))
      .select("title slug views category img createdAt likes")
      .lean();

    res.status(200).json({
      success: true,
      count: articles.length,
      data: articles,
    });
  })
);

// Get Liked Articles (MUST come before /:id route)
app.get(
  "/api/articles/liked",
  asyncHandler(async (req, res) => {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const userIdentifier = sanitizeInput(userId);

    const likedArticles = await Article.find({
      likedBy: userIdentifier,
    })
      .sort({ createdAt: -1 })
      .lean()
      .select("-__v");

    res.status(200).json({
      success: true,
      count: likedArticles.length,
      data: likedArticles,
    });
  })
);

// Get Article by Slug (MUST come before /:id route)
app.get(
  "/api/articles/slug/:slug",
  asyncHandler(async (req, res) => {
    const article = await Article.findOne({ slug: req.params.slug }).lean();

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    // Increment view count asynchronously (fire and forget)
    Article.findByIdAndUpdate(article._id, { $inc: { views: 1 } }).exec();

    res.status(200).json({
      success: true,
      data: article,
    });
  })
);

// Get All Articles
app.get(
  "/api/articles",
  asyncHandler(async (req, res) => {
    const {
      category,
      page = 1,
      limit = 10,
      search,
      sortBy = "createdAt",
    } = req.query;

    const query = {};
    if (category) query.category = sanitizeInput(category);
    if (search) {
      const sanitizedSearch = sanitizeInput(search);
      query.$or = [
        { title: { $regex: sanitizedSearch, $options: "i" } },
        { description: { $regex: sanitizedSearch, $options: "i" } },
      ];
    }

    const validSortFields = ["createdAt", "views", "likes", "title"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";

    const skip = (Math.max(1, +page) - 1) * Math.min(+limit, 50);
    const limitValue = Math.min(+limit, 50);

    const [articles, total] = await Promise.all([
      Article.find(query)
        .sort({ [sortField]: -1 })
        .limit(limitValue)
        .skip(skip)
        .lean()
        .select("-__v"),
      Article.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      count: articles.length,
      total,
      page: +page,
      totalPages: Math.ceil(total / limitValue),
      data: articles,
    });
  })
);

// Create Article
app.post(
  "/api/articles",
  upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "img", maxCount: 1 },
  ]),
  asyncHandler(async (req, res) => {
    const { category, title, description, code } = req.body;

    // Validate required fields
    if (!category || !title || !description || !code) {
      return res.status(400).json({
        success: false,
        message: "All fields (category, title, description, code) are required",
      });
    }

    // Validate files
    if (!req.files?.avatar?.[0] || !req.files?.img?.[0]) {
      return res.status(400).json({
        success: false,
        message: "Avatar and image files are required",
      });
    }

    // Sanitize inputs
    const sanitizedData = {
      category: sanitizeInput(category),
      title: sanitizeInput(title),
      description: sanitizeInput(description),
      code: code, // Code can contain special characters
    };

    // Upload images in parallel
    const [avatarResult, imgResult] = await Promise.all([
      uploadToCloudinary(req.files.avatar[0].buffer, "articles/avatars"),
      uploadToCloudinary(req.files.img[0].buffer, "articles/images"),
    ]);

    // Create article
    const article = await Article.create({
      ...sanitizedData,
      avatar: avatarResult.secure_url,
      avatarPublicId: avatarResult.public_id,
      img: imgResult.secure_url,
      imgPublicId: imgResult.public_id,
    });

    // Update category count asynchronously
    Category.findOneAndUpdate(
      { categoryName: sanitizedData.category },
      { $inc: { articleCount: 1 } }
    ).exec();

    res.status(201).json({
      success: true,
      message: "Article created successfully",
      data: article,
    });
  })
);

// Get Single Article by ID
app.get(
  "/api/articles/:id",
  asyncHandler(async (req, res) => {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid article ID format",
      });
    }

    const article = await Article.findById(req.params.id).lean();

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    // Increment view count asynchronously
    Article.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }).exec();

    res.status(200).json({
      success: true,
      data: article,
    });
  })
);

// Update Article
app.put(
  "/api/articles/:id",
  upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "img", maxCount: 1 },
  ]),
  asyncHandler(async (req, res) => {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid article ID format",
      });
    }

    const article = await Article.findById(req.params.id);

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    const updateData = {};

    // Sanitize text fields
    if (req.body.title) updateData.title = sanitizeInput(req.body.title);
    if (req.body.description)
      updateData.description = sanitizeInput(req.body.description);
    if (req.body.category)
      updateData.category = sanitizeInput(req.body.category);
    if (req.body.code) updateData.code = req.body.code;

    // Handle avatar update
    if (req.files?.avatar?.[0]) {
      const avatarResult = await uploadToCloudinary(
        req.files.avatar[0].buffer,
        "articles/avatars"
      );
      updateData.avatar = avatarResult.secure_url;
      updateData.avatarPublicId = avatarResult.public_id;

      // Delete old avatar
      deleteFromCloudinary(article.avatarPublicId);
    }

    // Handle image update
    if (req.files?.img?.[0]) {
      const imgResult = await uploadToCloudinary(
        req.files.img[0].buffer,
        "articles/images"
      );
      updateData.img = imgResult.secure_url;
      updateData.imgPublicId = imgResult.public_id;

      // Delete old image
      deleteFromCloudinary(article.imgPublicId);
    }

    const updatedArticle = await Article.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: "Article updated successfully",
      data: updatedArticle,
    });
  })
);

// Delete Article
app.delete(
  "/api/articles/:id",
  asyncHandler(async (req, res) => {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid article ID format",
      });
    }

    const article = await Article.findById(req.params.id);

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    // Delete images and article in parallel
    await Promise.all([
      deleteFromCloudinary(article.avatarPublicId),
      deleteFromCloudinary(article.imgPublicId),
      Article.findByIdAndDelete(req.params.id),
      Category.findOneAndUpdate(
        { categoryName: article.category },
        { $inc: { articleCount: -1 } }
      ),
    ]);

    res.status(200).json({
      success: true,
      message: "Article deleted successfully",
    });
  })
);

/* 
=========================================================================================
                        ARTICLE LIKE/UNLIKE SYSTEM
=========================================================================================
*/

// Like Article
app.post(
  "/api/articles/:id/like",
  asyncHandler(async (req, res) => {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid article ID format",
      });
    }

    const { userId } = req.body;
    const userIdentifier = userId
      ? sanitizeInput(userId)
      : `guest_${req.ip}_${Date.now()}`;

    const article = await Article.findById(req.params.id);

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    if (article.likedBy.includes(userIdentifier)) {
      return res.status(400).json({
        success: false,
        message: "You have already liked this article",
      });
    }

    article.likes += 1;
    article.likedBy.push(userIdentifier);
    await article.save();

    res.status(200).json({
      success: true,
      message: "Article liked successfully",
      data: {
        likes: article.likes,
        articleId: article._id,
      },
    });
  })
);

// Unlike Article
app.post(
  "/api/articles/:id/unlike",
  asyncHandler(async (req, res) => {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid article ID format",
      });
    }

    const { userId } = req.body;
    const userIdentifier = userId ? sanitizeInput(userId) : `guest_${req.ip}`;

    const article = await Article.findById(req.params.id);

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    if (!article.likedBy.includes(userIdentifier)) {
      return res.status(400).json({
        success: false,
        message: "You haven't liked this article",
      });
    }

    article.likes = Math.max(0, article.likes - 1);
    article.likedBy = article.likedBy.filter((id) => id !== userIdentifier);
    await article.save();

    res.status(200).json({
      success: true,
      message: "Article unliked successfully",
      data: {
        likes: article.likes,
        articleId: article._id,
      },
    });
  })
);

// Check Like Status
app.get(
  "/api/articles/:id/like-status",
  asyncHandler(async (req, res) => {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid article ID format",
      });
    }

    const { userId } = req.query;
    const userIdentifier = userId ? sanitizeInput(userId) : `guest_${req.ip}`;

    const article = await Article.findById(req.params.id).lean();

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        isLiked: article.likedBy.includes(userIdentifier),
        likeCount: article.likes,
        articleId: article._id,
      },
    });
  })
);

// Get Like Statistics
app.get(
  "/api/articles/:id/like-stats",
  asyncHandler(async (req, res) => {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid article ID format",
      });
    }

    const article = await Article.findById(req.params.id)
      .lean()
      .select("likes likedBy _id");

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        totalLikes: article.likes,
        uniqueLikers: article.likedBy.length,
      },
    });
  })
);

/* 
=========================================================================================
                        ARTICLE VIEW TRACKING
=========================================================================================
*/

// Track Article View
app.post(
  "/api/articles/:id/view",
  asyncHandler(async (req, res) => {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid article ID format",
      });
    }

    const article = await Article.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true, select: "views _id" }
    );

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "View tracked successfully",
      data: {
        views: article.views,
        articleId: article._id,
      },
    });
  })
);

// Get View Statistics
app.get(
  "/api/articles/:id/view-stats",
  asyncHandler(async (req, res) => {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid article ID format",
      });
    }

    const article = await Article.findById(req.params.id)
      .lean()
      .select("views title _id");

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        totalViews: article.views,
        articleId: article._id,
        title: article.title,
      },
    });
  })
);

/* 
=========================================================================================
                        COMMENT ROUTES
=========================================================================================
*/

// Get Comments for Article
app.get(
  "/api/articles/:id/comments",
  asyncHandler(async (req, res) => {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid article ID format",
      });
    }

    const { page = 1, limit = 20 } = req.query;
    const skip = (Math.max(1, +page) - 1) * Math.min(+limit, 50);
    const limitValue = Math.min(+limit, 50);

    const [comments, total] = await Promise.all([
      Comment.find({ articleId: req.params.id })
        .sort({ createdAt: -1 })
        .limit(limitValue)
        .skip(skip)
        .lean()
        .select("-__v"),
      Comment.countDocuments({ articleId: req.params.id }),
    ]);

    const formattedComments = comments.map((comment) => ({
      _id: comment._id,
      user: comment.user,
      text: comment.text,
      likes: comment.likes,
      time: formatTimeAgo(comment.createdAt),
      createdAt: comment.createdAt,
    }));

    res.status(200).json({
      success: true,
      count: formattedComments.length,
      total,
      page: +page,
      totalPages: Math.ceil(total / limitValue),
      data: formattedComments,
    });
  })
);

// Create Comment
app.post(
  "/api/articles/:id/comments",
  asyncHandler(async (req, res) => {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid article ID format",
      });
    }

    const { user, text } = req.body;

    if (!user || !text || !user.trim() || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: "User name and comment text are required",
      });
    }

    // Check if article exists
    const articleExists = await Article.exists({ _id: req.params.id });
    if (!articleExists) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    const comment = await Comment.create({
      articleId: req.params.id,
      user: sanitizeInput(user),
      text: sanitizeInput(text),
    });

    res.status(201).json({
      success: true,
      message: "Comment added successfully",
      data: {
        _id: comment._id,
        user: comment.user,
        text: comment.text,
        likes: comment.likes,
        time: "এখন",
        createdAt: comment.createdAt,
      },
    });
  })
);

// Like Comment
app.post(
  "/api/comments/:id/like",
  asyncHandler(async (req, res) => {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid comment ID format",
      });
    }

    const comment = await Comment.findByIdAndUpdate(
      req.params.id,
      { $inc: { likes: 1 } },
      { new: true, select: "likes _id" }
    );

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Comment liked successfully",
      data: {
        likes: comment.likes,
        commentId: comment._id,
      },
    });
  })
);

// Delete Comment
app.delete(
  "/api/comments/:id",
  asyncHandler(async (req, res) => {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid comment ID format",
      });
    }

    const comment = await Comment.findByIdAndDelete(req.params.id);

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Comment deleted successfully",
    });
  })
);

/* 
=========================================================================================
                        PROJECT ROUTES
=========================================================================================
*/

// Get All Projects
app.get(
  "/api/projects",
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, category, search } = req.query;

    const query = {};
    if (category) query.category = sanitizeInput(category);
    if (search) {
      const sanitizedSearch = sanitizeInput(search);
      query.$or = [
        { title: { $regex: sanitizedSearch, $options: "i" } },
        { description: { $regex: sanitizedSearch, $options: "i" } },
      ];
    }

    const skip = (Math.max(1, +page) - 1) * Math.min(+limit, 50);
    const limitValue = Math.min(+limit, 50);

    const [projects, total] = await Promise.all([
      Project.find(query)
        .sort({ createdAt: -1 })
        .limit(limitValue)
        .skip(skip)
        .lean()
        .select("-__v"),
      Project.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      count: projects.length,
      total,
      page: +page,
      totalPages: Math.ceil(total / limitValue),
      data: projects,
    });
  })
);

// Get Single Project
app.get(
  "/api/projects/:id",
  asyncHandler(async (req, res) => {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid project ID format",
      });
    }

    const project = await Project.findById(req.params.id).lean();

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    res.status(200).json({
      success: true,
      data: project,
    });
  })
);

/* 
=========================================================================================
                        SHARE TRACKING
=========================================================================================
*/

// Track Article Share
app.post(
  "/api/articles/:id/share",
  asyncHandler(async (req, res) => {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid article ID format",
      });
    }

    const articleExists = await Article.exists({ _id: req.params.id });

    if (!articleExists) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Share tracked successfully",
    });
  })
);

/* 
=========================================================================================
                        BASE ROUTES
=========================================================================================
*/

// Root Route
app.get("/", (req, res) => {
  res.json({
    name: "Fenrir Qutrub Server 🚀",
    version: "2.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
    endpoints: {
      categories: "/api/categories",
      articles: "/api/articles",
      projects: "/api/projects",
      comments: "/api/articles/:id/comments",
      health: "/health",
    },
  });
});

// Health Check
app.get("/health", (req, res) => {
  const health = {
    success: true,
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  };

  const statusCode = mongoose.connection.readyState === 1 ? 200 : 503;
  res.status(statusCode).json(health);
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.originalUrl,
    method: req.method,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("❌ Error:", err);

  // Mongoose validation error
  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: "Validation Error",
      errors: Object.values(err.errors).map((e) => e.message),
    });
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: `Invalid ${err.path}: ${err.value}`,
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(409).json({
      success: false,
      message: `${field} already exists`,
    });
  }

  // Multer file upload error
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File size too large. Maximum size is 5MB",
      });
    }
    return res.status(400).json({
      success: false,
      message: `File upload error: ${err.message}`,
    });
  }

  // CORS error
  if (err.message.includes("CORS")) {
    return res.status(403).json({
      success: false,
      message: "CORS: Origin not allowed",
    });
  }

  // JWT errors (if you add authentication later)
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      message: "Token expired",
    });
  }

  // Default error
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && {
      stack: err.stack,
      error: err,
    }),
  });
});

/* 
=========================================================================================
                        SERVER START
=========================================================================================
*/

// For local development
if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`🚀 Fenrir Qutrub Server running on port ${port}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`🌐 Local: http://localhost:${port}`);
  });
}

// Graceful Shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 ${signal} received, shutting down gracefully...`);

  try {
    await mongoose.connection.close();
    console.log("✅ MongoDB connection closed");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during shutdown:", error);
    process.exit(1);
  }
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});

// Export for Vercel serverless
export default app;

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

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

// CORS Configuration
const allowedOrigins = [
  "https://fenrirqutrub-client.vercel.app",
  "https://fenrirqutrub.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, Postman, or server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Allow any vercel.app subdomain for development
      if (origin.endsWith(".vercel.app")) {
        return callback(null, true);
      }

      // Reject other origins
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer Configuration
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"));
    }
  },
});

// MongoDB Connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Successfully connected to MongoDB!");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
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
    },
    articleCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

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
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      minlength: [20, "Description must be at least 20 characters"],
    },
    code: {
      type: String,
      required: [true, "Code is required"],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    views: {
      type: Number,
      default: 0,
    },
    likes: {
      type: Number,
      default: 0,
    },
    likedBy: [String],
  },
  { timestamps: true }
);

articleSchema.pre("save", function (next) {
  if (this.isModified("title")) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
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
    },
    user: {
      type: String,
      required: [true, "User name is required"],
      trim: true,
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
    },
  },
  { timestamps: true }
);

const Comment = mongoose.model("Comment", commentSchema);

// Project Model
const projectSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    fullDescription: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    technologies: [String],
    github: String,
    demo: String,
  },
  { timestamps: true }
);

const Project = mongoose.model("Project", projectSchema);

/* 
=========================================================================================
                        HELPER FUNCTIONS
=========================================================================================
*/

const uploadToCloudinary = (fileBuffer, folder = "articles") => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "auto" },
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
    uploadStream.end(fileBuffer);
  });
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

    const existingCategory = await Category.findOne({
      categoryName: { $regex: new RegExp(`^${categoryName}$`, "i") },
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: "Category already exists",
      });
    }

    const category = await Category.create({ categoryName });

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
    const categories = await Category.find().sort({ createdAt: -1 });

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
    const category = await Category.findById(req.params.id);

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
    const { categoryName } = req.body;

    const existingCategory = await Category.findOne({
      categoryName: { $regex: new RegExp(`^${categoryName}$`, "i") },
      _id: { $ne: req.params.id },
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: "Category name already exists",
      });
    }

    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { categoryName },
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

// Create Article
app.post(
  "/api/articles",
  upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "img", maxCount: 1 },
  ]),
  asyncHandler(async (req, res) => {
    const { category, title, description, code } = req.body;

    if (!category || !title || !description || !code) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    if (!req.files?.avatar || !req.files?.img) {
      return res.status(400).json({
        success: false,
        message: "Avatar and image are required",
      });
    }

    const [avatarResult, imgResult] = await Promise.all([
      uploadToCloudinary(req.files.avatar[0].buffer, "articles/avatars"),
      uploadToCloudinary(req.files.img[0].buffer, "articles/images"),
    ]);

    const article = await Article.create({
      category,
      avatar: avatarResult.secure_url,
      avatarPublicId: avatarResult.public_id,
      img: imgResult.secure_url,
      imgPublicId: imgResult.public_id,
      title,
      description,
      code,
    });

    await Category.findOneAndUpdate(
      { categoryName: category },
      { $inc: { articleCount: 1 } }
    );

    res.status(201).json({
      success: true,
      message: "Article created successfully",
      data: article,
    });
  })
);

// Get All Articles
app.get(
  "/api/articles",
  asyncHandler(async (req, res) => {
    const { category, page = 1, limit = 10, search } = req.query;

    const query = {};
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;
    const [articles, total] = await Promise.all([
      Article.find(query).sort({ createdAt: -1 }).limit(+limit).skip(skip),
      Article.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      count: articles.length,
      total,
      page: +page,
      totalPages: Math.ceil(total / limit),
      data: articles,
    });
  })
);

// Get Single Article by ID
app.get(
  "/api/articles/:id",
  asyncHandler(async (req, res) => {
    const article = await Article.findById(req.params.id);

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    article.views += 1;
    await article.save();

    res.status(200).json({
      success: true,
      data: article,
    });
  })
);

// Get Article by Slug
app.get(
  "/api/articles/slug/:slug",
  asyncHandler(async (req, res) => {
    const article = await Article.findOne({ slug: req.params.slug });

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    article.views += 1;
    await article.save();

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
    const article = await Article.findById(req.params.id);

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    const updateData = { ...req.body };

    if (req.files?.avatar) {
      if (article.avatarPublicId) {
        await cloudinary.uploader.destroy(article.avatarPublicId);
      }
      const avatarResult = await uploadToCloudinary(
        req.files.avatar[0].buffer,
        "articles/avatars"
      );
      updateData.avatar = avatarResult.secure_url;
      updateData.avatarPublicId = avatarResult.public_id;
    }

    if (req.files?.img) {
      if (article.imgPublicId) {
        await cloudinary.uploader.destroy(article.imgPublicId);
      }
      const imgResult = await uploadToCloudinary(
        req.files.img[0].buffer,
        "articles/images"
      );
      updateData.img = imgResult.secure_url;
      updateData.imgPublicId = imgResult.public_id;
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
    const article = await Article.findById(req.params.id);

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    await Promise.all([
      article.avatarPublicId &&
        cloudinary.uploader.destroy(article.avatarPublicId),
      article.imgPublicId && cloudinary.uploader.destroy(article.imgPublicId),
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
    const { userId } = req.body;
    const userIdentifier = userId || `guest_${req.ip}_${Date.now()}`;

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
      data: article,
    });
  })
);

// Unlike Article
app.post(
  "/api/articles/:id/unlike",
  asyncHandler(async (req, res) => {
    const { userId } = req.body;
    const userIdentifier = userId || `guest_${req.ip}_${Date.now()}`;

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
      data: article,
    });
  })
);

// Check Like Status
app.get(
  "/api/articles/:id/like-status",
  asyncHandler(async (req, res) => {
    const { userId } = req.query;
    const userIdentifier = userId || `guest_${req.ip}`;

    const article = await Article.findById(req.params.id);

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

// Get Liked Articles
app.get(
  "/api/articles/liked",
  asyncHandler(async (req, res) => {
    const { userId } = req.query;
    const userIdentifier = userId || `guest_${req.ip}`;

    const likedArticles = await Article.find({
      likedBy: userIdentifier,
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: likedArticles.length,
      data: likedArticles,
    });
  })
);

// Get Like Statistics
app.get(
  "/api/articles/:id/like-stats",
  asyncHandler(async (req, res) => {
    const article = await Article.findById(req.params.id);

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
    const article = await Article.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
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
    const article = await Article.findById(req.params.id);

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

// Get Most Viewed Articles
app.get(
  "/api/articles/most-viewed",
  asyncHandler(async (req, res) => {
    const { limit = 10 } = req.query;

    const articles = await Article.find()
      .sort({ views: -1 })
      .limit(+limit)
      .select("title slug views category img createdAt");

    res.status(200).json({
      success: true,
      count: articles.length,
      data: articles,
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
    const comments = await Comment.find({ articleId: req.params.id })
      .sort({ createdAt: -1 })
      .lean();

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
      data: formattedComments,
    });
  })
);

// Create Comment
app.post(
  "/api/articles/:id/comments",
  asyncHandler(async (req, res) => {
    const { user, text } = req.body;

    if (!user || !text) {
      return res.status(400).json({
        success: false,
        message: "User name and comment text are required",
      });
    }

    const article = await Article.findById(req.params.id);
    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    const comment = await Comment.create({
      articleId: req.params.id,
      user,
      text,
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
    const comment = await Comment.findByIdAndUpdate(
      req.params.id,
      { $inc: { likes: 1 } },
      { new: true }
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
      data: comment,
    });
  })
);

// Delete Comment
app.delete(
  "/api/comments/:id",
  asyncHandler(async (req, res) => {
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
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;
    const [projects, total] = await Promise.all([
      Project.find(query).sort({ createdAt: -1 }).limit(+limit).skip(skip),
      Project.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      count: projects.length,
      total,
      page: +page,
      totalPages: Math.ceil(total / limit),
      data: projects,
    });
  })
);

// Get Single Project
app.get(
  "/api/projects/:id",
  asyncHandler(async (req, res) => {
    const project = await Project.findById(req.params.id);

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
    const article = await Article.findById(req.params.id);

    if (!article) {
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
    endpoints: {
      categories: "/api/categories",
      articles: "/api/articles",
      projects: "/api/projects",
      comments: "/api/articles/:id/comments",
    },
  });
});

// Health Check
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.originalUrl,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("❌ Error:", err.stack);

  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: "Validation Error",
      errors: Object.values(err.errors).map((e) => e.message),
    });
  }

  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "Invalid ID format",
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Something went wrong!",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

/* 
=========================================================================================
                        SERVER START
=========================================================================================
*/

// Start Server
app.listen(port, () => {
  console.log(`🚀 Fenrir Qutrub Server running on port ${port}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`);
});

// Graceful Shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down gracefully...");
  await mongoose.connection.close();
  console.log("✅ MongoDB connection closed");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 SIGTERM received, shutting down...");
  await mongoose.connection.close();
  console.log("✅ MongoDB connection closed");
  process.exit(0);
});

// Export for Vercel
export default app;

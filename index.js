import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Verify Cloudinary config
console.log("☁️  Cloudinary Config:", {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY ? "✓ Set" : "✗ Missing",
  api_secret: process.env.CLOUDINARY_API_SECRET ? "✓ Set" : "✗ Missing",
});

// Helper function to upload to Cloudinary
const uploadToCloudinary = (fileBuffer, folder = "articles") => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: "auto",
      },
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

// Multer configuration for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"));
    }
  },
});

// Middleware
const allowedOrigins = [
  "https://fenrirqutrub-client.vercel.app",
  "https://fenrirqutrub.vercel.app",
  "http://localhost:5173",
];

// Update the CORS configuration in your server.js
const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // ✅ Add this line
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection with Mongoose
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Successfully connected to MongoDB!");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
};

// Connect to Database
connectDB();

/* 
-----------------------------------------------------------------------------------------
                        MODELS
------------------------------------------------------------------------------------------
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
  {
    timestamps: true,
  }
);

// Create slug before saving
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
// Article Model - UPDATED
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
    avatarPublicId: {
      type: String,
    },
    img: {
      type: String,
      required: [true, "Image is required"],
    },
    imgPublicId: {
      type: String,
    },
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
    // ✅ NEW: Track who liked this article
    likedBy: [
      {
        type: String, // Store user IDs or session IDs
        default: [],
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Create slug before saving
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

/* -----------------------------------------------------------------------------------------
                              CATEGORY ROUTES
------------------------------------------------------------------------------------------*/

// Create Category
app.post("/api/categories", async (req, res) => {
  try {
    const { categoryName } = req.body;

    // Check if category already exists
    const existingCategory = await Category.findOne({
      categoryName: { $regex: new RegExp(`^${categoryName}$`, "i") },
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: "Category already exists",
      });
    }

    // Create new category
    const category = new Category({ categoryName });
    await category.save();

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: category,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating category",
      error: error.message,
    });
  }
});

// Get All Categories
app.get("/api/categories", async (req, res) => {
  try {
    const categories = await Category.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching categories",
      error: error.message,
    });
  }
});

// Get Single Category
app.get("/api/categories/:id", async (req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching category",
      error: error.message,
    });
  }
});

// Update Category
app.put("/api/categories/:id", async (req, res) => {
  try {
    const { categoryName } = req.body;

    // Check if new name already exists (excluding current category)
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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating category",
      error: error.message,
    });
  }
});

// Delete Category
app.delete("/api/categories/:id", async (req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting category",
      error: error.message,
    });
  }
});

/* 
-----------------------------------------------------------------------------------------
                        ARTICLE ROUTES
------------------------------------------------------------------------------------------
*/

// Create Article with Image Upload
app.post(
  "/api/articles",
  upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "img", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      console.log("📝 Request body:", req.body);
      console.log("📁 Request files:", req.files);

      const { category, title, description, code } = req.body;

      // Validate required fields
      if (!category || !title || !description || !code) {
        console.log("❌ Missing required fields");
        return res.status(400).json({
          success: false,
          message: "All fields are required",
        });
      }

      // Check if files are uploaded
      if (!req.files || !req.files.avatar || !req.files.img) {
        console.log("❌ Missing image files");
        return res.status(400).json({
          success: false,
          message: "Avatar and image are required",
        });
      }

      console.log("⬆️  Uploading avatar to Cloudinary...");
      // Upload avatar to Cloudinary
      const avatarResult = await uploadToCloudinary(
        req.files.avatar[0].buffer,
        "articles/avatars"
      );
      console.log("✅ Avatar uploaded:", avatarResult.secure_url);

      console.log("⬆️  Uploading image to Cloudinary...");
      // Upload image to Cloudinary
      const imgResult = await uploadToCloudinary(
        req.files.img[0].buffer,
        "articles/images"
      );
      console.log("✅ Image uploaded:", imgResult.secure_url);

      // Create new article
      const article = new Article({
        category,
        avatar: avatarResult.secure_url,
        avatarPublicId: avatarResult.public_id,
        img: imgResult.secure_url,
        imgPublicId: imgResult.public_id,
        title,
        description,
        code,
      });

      console.log("💾 Saving article to database...");
      await article.save();
      console.log("✅ Article saved:", article._id);

      // Update category article count
      await Category.findOneAndUpdate(
        { categoryName: category },
        { $inc: { articleCount: 1 } }
      );

      res.status(201).json({
        success: true,
        message: "Article created successfully",
        data: article,
      });
    } catch (error) {
      console.error("❌ Error creating article:", error);
      console.error("Error stack:", error.stack);
      res.status(500).json({
        success: false,
        message: "Error creating article",
        error: error.message,
      });
    }
  }
);

// Get All Articles
app.get("/api/articles", async (req, res) => {
  try {
    const { category, page = 1, limit = 10, search } = req.query;

    // Build query
    let query = {};

    if (category) {
      query.category = category;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    // Pagination
    const skip = (page - 1) * limit;

    const articles = await Article.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Article.countDocuments(query);

    res.status(200).json({
      success: true,
      count: articles.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
      data: articles,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching articles",
      error: error.message,
    });
  }
});

// Get Single Article by ID
app.get("/api/articles/:id", async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    // Increment views
    article.views += 1;
    await article.save();

    res.status(200).json({
      success: true,
      data: article,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching article",
      error: error.message,
    });
  }
});

// Get Article by Slug
app.get("/api/articles/slug/:slug", async (req, res) => {
  try {
    const article = await Article.findOne({ slug: req.params.slug });

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    // Increment views
    article.views += 1;
    await article.save();

    res.status(200).json({
      success: true,
      data: article,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching article",
      error: error.message,
    });
  }
});

// Update Article
app.put(
  "/api/articles/:id",
  upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "img", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const article = await Article.findById(req.params.id);

      if (!article) {
        return res.status(404).json({
          success: false,
          message: "Article not found",
        });
      }

      // Update text fields
      const updateData = { ...req.body };

      // If new avatar is uploaded, delete old one and update
      if (req.files && req.files.avatar) {
        // Delete old avatar from Cloudinary
        if (article.avatarPublicId) {
          await cloudinary.uploader.destroy(article.avatarPublicId);
        }

        // Upload new avatar
        const avatarResult = await uploadToCloudinary(
          req.files.avatar[0].buffer,
          "articles/avatars"
        );

        updateData.avatar = avatarResult.secure_url;
        updateData.avatarPublicId = avatarResult.public_id;
      }

      // If new image is uploaded, delete old one and update
      if (req.files && req.files.img) {
        // Delete old image from Cloudinary
        if (article.imgPublicId) {
          await cloudinary.uploader.destroy(article.imgPublicId);
        }

        // Upload new image
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
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error updating article",
        error: error.message,
      });
    }
  }
);

// Delete Article
app.delete("/api/articles/:id", async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    // Delete images from Cloudinary
    if (article.avatarPublicId) {
      await cloudinary.uploader.destroy(article.avatarPublicId);
    }
    if (article.imgPublicId) {
      await cloudinary.uploader.destroy(article.imgPublicId);
    }

    // Delete article from database
    await Article.findByIdAndDelete(req.params.id);

    // Decrement category article count
    await Category.findOneAndUpdate(
      { categoryName: article.category },
      { $inc: { articleCount: -1 } }
    );

    res.status(200).json({
      success: true,
      message: "Article deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting article",
      error: error.message,
    });
  }
});

// Like Article
/* 
-----------------------------------------------------------------------------------------
                        ARTICLE LIKE/UNLIKE SYSTEM
------------------------------------------------------------------------------------------
*/

// ✅ POST: Like Article
app.post("/api/articles/:id/like", async (req, res) => {
  try {
    const { userId } = req.body; // Get userId from request body (or session)

    // Default to a session-based ID if no userId provided
    const userIdentifier = userId || `guest_${req.ip}_${Date.now()}`;

    const article = await Article.findById(req.params.id);

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    // Check if user already liked this article
    if (article.likedBy.includes(userIdentifier)) {
      return res.status(400).json({
        success: false,
        message: "You have already liked this article",
      });
    }

    // Add like
    article.likes += 1;
    article.likedBy.push(userIdentifier);
    await article.save();

    res.status(200).json({
      success: true,
      message: "Article liked successfully",
      data: article,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error liking article",
      error: error.message,
    });
  }
});

// ✅ POST: Unlike Article
app.post("/api/articles/:id/unlike", async (req, res) => {
  try {
    const { userId } = req.body;
    const userIdentifier = userId || `guest_${req.ip}_${Date.now()}`;

    const article = await Article.findById(req.params.id);

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    // Check if user hasn't liked this article
    if (!article.likedBy.includes(userIdentifier)) {
      return res.status(400).json({
        success: false,
        message: "You haven't liked this article",
      });
    }

    // Remove like
    article.likes = Math.max(0, article.likes - 1);
    article.likedBy = article.likedBy.filter((id) => id !== userIdentifier);
    await article.save();

    res.status(200).json({
      success: true,
      message: "Article unliked successfully",
      data: article,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error unliking article",
      error: error.message,
    });
  }
});

// ✅ GET: Check if User Liked an Article
app.get("/api/articles/:id/like-status", async (req, res) => {
  try {
    const { userId } = req.query;
    const userIdentifier = userId || `guest_${req.ip}`;

    const article = await Article.findById(req.params.id);

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    const isLiked = article.likedBy.includes(userIdentifier);

    res.status(200).json({
      success: true,
      data: {
        isLiked,
        likeCount: article.likes,
        articleId: article._id,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error checking like status",
      error: error.message,
    });
  }
});

// ✅ GET: Get All Liked Articles by User
app.get("/api/articles/liked", async (req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching liked articles",
      error: error.message,
    });
  }
});

// ✅ GET: Get Like Statistics for Article
app.get("/api/articles/:id/like-stats", async (req, res) => {
  try {
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
        likers: article.likedBy, // You might want to hide this in production
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching like statistics",
      error: error.message,
    });
  }
});

/* 
-----------------------------------------------------------------------------------------
                        like comment start
------------------------------------------------------------------------------------------
*/
// Add these routes to your existing server.js file

/* 
-----------------------------------------------------------------------------------------
                        COMMENT ROUTES (ADD THESE)
------------------------------------------------------------------------------------------
*/

// Comment Model (Add this model)
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
  {
    timestamps: true,
  }
);

const Comment = mongoose.model("Comment", commentSchema);

// Get Comments for an Article
app.get("/api/articles/:id/comments", async (req, res) => {
  try {
    const comments = await Comment.find({ articleId: req.params.id })
      .sort({ createdAt: -1 })
      .lean();

    // Format comments for frontend
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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching comments",
      error: error.message,
    });
  }
});

// Create Comment for an Article
app.post("/api/articles/:id/comments", async (req, res) => {
  try {
    const { user, text } = req.body;

    // Validate required fields
    if (!user || !text) {
      return res.status(400).json({
        success: false,
        message: "User name and comment text are required",
      });
    }

    // Check if article exists
    const article = await Article.findById(req.params.id);
    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    // Create comment
    const comment = new Comment({
      articleId: req.params.id,
      user,
      text,
    });

    await comment.save();

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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error adding comment",
      error: error.message,
    });
  }
});

// Like a Comment
app.post("/api/comments/:id/like", async (req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error liking comment",
      error: error.message,
    });
  }
});

// Delete Comment
app.delete("/api/comments/:id", async (req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting comment",
      error: error.message,
    });
  }
});

/* 
-----------------------------------------------------------------------------------------
                        SHARE TRACKING ROUTE (OPTIONAL)
------------------------------------------------------------------------------------------
*/

// Track Article Share (Optional - for analytics)
app.post("/api/articles/:id/share", async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    // You can add a shares field to your Article model
    // For now, just acknowledge the share
    res.status(200).json({
      success: true,
      message: "Share tracked successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error tracking share",
      error: error.message,
    });
  }
});

/* 
-----------------------------------------------------------------------------------------
                        HELPER FUNCTIONS
------------------------------------------------------------------------------------------
*/

// Format time ago helper function
function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);

  let interval = seconds / 31536000; // years
  if (interval > 1) {
    return Math.floor(interval) + " years ago";
  }

  interval = seconds / 2592000; // months
  if (interval > 1) {
    return Math.floor(interval) + " month ago";
  }

  interval = seconds / 86400; // days
  if (interval > 1) {
    return Math.floor(interval) + " days ago";
  }

  interval = seconds / 3600; // hours
  if (interval > 1) {
    return Math.floor(interval) + " hour ago";
  }

  interval = seconds / 60; // minutes
  if (interval > 1) {
    return Math.floor(interval) + " min ago";
  }

  return Math.floor(seconds) + " second ago";
}

/*
-----------------------------------------------------------------------------------------
                        like comment end
------------------------------------------------------------------------------------------
*/

/*
-----------------------------------------------------------------------------------------
                        view start
------------------------------------------------------------------------------------------
*/

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
    technologies: {
      type: [String],
      default: [],
    },
    github: {
      type: String,
    },
    demo: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

const Project = mongoose.model("Project", projectSchema);

// Get All Projects
app.get("/api/projects", async (req, res) => {
  try {
    const { page = 1, limit = 10, category, search } = req.query;

    // Build query
    let query = {};

    if (category) {
      query.category = category;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    // Pagination
    const skip = (page - 1) * limit;

    const projects = await Project.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Project.countDocuments(query);

    res.status(200).json({
      success: true,
      count: projects.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
      data: projects,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching projects",
      error: error.message,
    });
  }
});

// Get Single Project by ID
app.get("/api/projects/:id", async (req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching project",
      error: error.message,
    });
  }
});

/* 
-----------------------------------------------------------------------------------------
                        ARTICLE VIEW TRACKING
------------------------------------------------------------------------------------------
*/

// POST: Track Article View
app.post("/api/articles/:id/view", async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);

    if (!article) {
      return res.status(404).json({
        success: false,
        message: "Article not found",
      });
    }

    // Increment view count
    article.views += 1;
    await article.save();

    res.status(200).json({
      success: true,
      message: "View tracked successfully",
      data: {
        views: article.views,
        articleId: article._id,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error tracking view",
      error: error.message,
    });
  }
});

// GET: Get View Statistics for Article
app.get("/api/articles/:id/view-stats", async (req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching view statistics",
      error: error.message,
    });
  }
});

// GET: Get Most Viewed Articles
app.get("/api/articles/most-viewed", async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const articles = await Article.find()
      .sort({ views: -1 })
      .limit(parseInt(limit))
      .select("title slug views category img createdAt");

    res.status(200).json({
      success: true,
      count: articles.length,
      data: articles,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching most viewed articles",
      error: error.message,
    });
  }
});
/*
-----------------------------------------------------------------------------------------
                        view end
------------------------------------------------------------------------------------------
*/

/* 
-----------------------------------------------------------------------------------------
                        BASE ROUTES
------------------------------------------------------------------------------------------
*/

// Root route
app.get("/", (req, res) => {
  res.json({
    name: "Fenrir Qutrub server is running 🚀",
    age: "69",
  });
});

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Fenrir Qutrub server is running on port ${port}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  await mongoose.connection.close();
  console.log("MongoDB connection closed");
  process.exit(0);
});

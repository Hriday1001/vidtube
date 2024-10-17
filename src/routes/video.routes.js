import { Router } from "express";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { deleteVideo, getVideoById, publishAVideo, togglePublishStatus, updateVideo } from "../controllers/video.controller.js";

const router = Router();

router.route("/publish-video").post(
    verifyJWT,
    upload.fields([
        {
            name : "videoFile",
            maxCount : 1
        },
        {
            name : "thumbnail",
            maxCount : 1
        }
    ]),
    publishAVideo
)

router.route("/:videoId")
.get(
    verifyJWT,
    getVideoById
)
.patch(
    verifyJWT,
    upload.single("thumbnail"),
    updateVideo
)
.delete(
    verifyJWT,
    deleteVideo
)

router.route("/toggle-publish-status/:videoId").patch(
    verifyJWT,
    togglePublishStatus
)

export default router;
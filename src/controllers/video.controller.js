import mongoose, {isValidObjectId} from "mongoose"
import {Video} from "../models/video.model.js"
import {User} from "../models/user.model.js"
import {ApiError} from "../utils/apiError.js"
import {ApiResponse} from "../utils/apiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import { deleteFromCloudinary, uploadToCloudinary } from "../utils/cloudinary.js"


const getAllVideos = asyncHandler(async (req, res) => {
    //TODO: get all videos based on query, sort, pagination
    const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query
    
})

const publishAVideo = asyncHandler(async (req, res) => {
    // TODO: get video, upload to cloudinary, create video
    const { title, description} = req.body

    if(!title || !description){
        throw new ApiError(400,"Title and description both are required");
    }

    const videoFileLocalPath = req.files?.videoFile[0]?.path;
    const thumbnailLocalPath = req.files?.thumbnail[0]?.path;

    // console.log(videoFileLocalPath)
    // console.log(thumbnailLocalPath)

    if(!videoFileLocalPath){
        throw new ApiError(400,"Video file is required");
    }

    if(!thumbnailLocalPath){
        throw new ApiError(400,"Thumbnail is required");
    }

    const video = await uploadToCloudinary(videoFileLocalPath);
    const thumbnail = await uploadToCloudinary(thumbnailLocalPath);

    // console.log(video)
    // console.log(thumbnail)

    if(!video.url){
        throw new ApiError(500,"Upload to cloudinary failed")
    }

    if(!thumbnail.url){
        throw new ApiError(500,"Upload to cloudinary failed")
    }

    const videoStored = await Video.create({
        videoFile : video.url,
        thumbnail : thumbnail.url,
        title : title,
        description : description,
        duration : video.duration,
        views : 0,
        isPublished : true,
        owner : req.user?._id
    })

    // console.log(videoStored)

    if(!videoStored){
        throw new ApiError(500,"Something went wrong while publishing video");
    }

    return res.status(200)
    .json(
        new ApiResponse(
            200,
            videoStored,
            "Video published successfully"
        )
    )

    
})

const getVideoById = asyncHandler(async (req, res) => {
    //TODO: get video by id
    const { videoId } = req.params

    if(!videoId){
        throw new ApiError(400,"Invalid video id");
    }
    
    const video = await Video.findById(videoId);

    if(!video){
        throw new ApiError(400,"Invalid video id");
    }

    if(!video.isPublished){
        throw new ApiError(400,"Video currently unpublished");
    }

    return res.status(200)
    .json(
        new ApiResponse(
            200,
            video,
            "Video retrieved successfully"
        )
    )

})

const updateVideo = asyncHandler(async (req, res) => {
    //TODO: update video details like title, description, thumbnail
    const { videoId } = req.params
    const {title , description} = req.body;
    let thumbnail;
    if(req.file){
        thumbnail = req.file;
    }

    if(!videoId){
        throw new ApiError(400,"Invalid video id");
    }
    const video = await Video.findById(videoId);
    if(!video){
        throw new ApiError(400,"Invalid video id");
    }

    if(!(video.owner.equals(req.user?._id))){
        throw new ApiError(401,"Not authorized to update video details");
    }

    if(!title && !description && !thumbnail){
        throw new ApiError(400 , "No update information provided");
    }

    if(title){
        video.title = title;
    }

    if(description){
        video.description = description;
    }

    if(thumbnail){
        const thumbnailLocalPath = req.file?.path;
        if(!thumbnailLocalPath){
            throw new ApiError(400,"New Thumbnail file absent");
        }

        const newThumbnail = await uploadToCloudinary(thumbnailLocalPath);

        if(!newThumbnail.url){
            throw new ApiError(500,"Upload to cloudinary failed");
        }

        const oldThumbnail = video.thumbnail;
        // console.log(oldThumbnail);
        await deleteFromCloudinary(oldThumbnail,"image");

        video.thumbnail = newThumbnail.url;
        
    }

    video.save();

    return res.status(200)
    .json(
        new ApiResponse(
            200,
            video,
            "Video updated successfully"
        )
    )
    

})

const deleteVideo = asyncHandler(async (req, res) => {
    //TODO: delete video
    const { videoId } = req.params
    if(!videoId){
        throw new ApiError(401,"Provide videoId");
    }

    const video = await Video.findById(videoId);

    if(!video){
        throw new ApiError(401,"Video doesnt exist");
    }

    if(!(video.owner.equals(req.user?._id))){
        throw new ApiError(401,"Not authorized to update video details");
    }

    console.log(video.videoFile);

    const delvid = await deleteFromCloudinary(video.videoFile,"video");
    const delthumb = await deleteFromCloudinary(video.thumbnail,"image");

    console.log(delvid);
    console.log(delthumb);

    const delMod = await Video.deleteOne({
        _id : videoId
    })

    console.log(delMod);

    return res.status(200)
    .json(
        new ApiResponse(
            200,
            {},
            "Video deleted successfully"
        )
    )  
})

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    if(!videoId){
        throw new ApiError(401,"Provide videoId");
    }

    const video = await Video.findById(videoId);
    const publishStatus = video.isPublished;

    video.isPublished = !publishStatus;

    video.save();


    return res.status(200)
    .json(
        new ApiResponse(
            200,
            video,
            "Publish status toggled successfully"
        )
    )

    
})

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus
}
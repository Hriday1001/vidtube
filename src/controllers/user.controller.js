import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/apiError.js";
import {User} from "../models/user.model.js";
import {deleteFromCloudinary, uploadToCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/apiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave : false});

        return {
            accessToken,
            refreshToken
        }

    } catch (error) {
        throw new ApiError(500,"Something went wrong while generating refresh and access token");
    }
}

const registerUser = asyncHandler( async (req , res) => {
    // get user details from frontend
    // validation : not empty data
    // check if user already exists : (username,email)
    // check for images , check for avatar(compulsory)
    // upload them to cloudinary , check for avatar
    // create user object - create entry in db
    // remove password and refresh token field from response
    // check for user creation
    // return res

    const {fullname , email , username , password} = req.body;
    // console.log("email : " , email);
    console.log(req.body);

    if(
        [fullname,email,username,password].some((field) => field?.trim() === "")
    ){
        throw new ApiError(400," All fields are required ")
    }

    const existingUser = await User.findOne({
        $or: [{username} , {email}]
    })

    if(existingUser){
        throw new ApiError(409," User already exists ");
    }

    // console.log(req.files);

    const avatarLocalPath = req.files?.avatar[0]?.path;
    // console.log(req.files.avatar);
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;
    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    if(!avatarLocalPath){
        throw new ApiError(400," Avatar file is required ");
    }

    const avatar = await uploadToCloudinary(avatarLocalPath)
    const coverImage = await uploadToCloudinary(coverImageLocalPath);

    if(!avatar){
        throw new ApiError(400," Avatar file is required ");
    }

    const user = await User.create({
        fullname : fullname,
        avatar : avatar.url,
        coverImage : coverImage?.url || "",
        email : email,
        password : password,
        username : username.toLowerCase()
    })

    const userCreated = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if(!userCreated){
        throw new ApiError(500, " Something went wrong while registering the user ")
    }

    return res.status(201).json(
        new ApiResponse(200,userCreated," User registered successfully ")
    )

})

const loginUser = asyncHandler( async (req,res) => {
    // get user details from frontend
    // validation : not empty data
    // check if user already exists : (username,email)
    // check password
    // access and refresh token
    // send cookies

    const {email , username , password} = req.body;
    if(!username && !email){
        throw new ApiError(400, "Username or Email is requiured")
    }

    const existingUser = await User.findOne({
        $or : [{username} , {email}]
    })

    if(!existingUser){
        throw new ApiError(404, "User doesn't exist")
    }

    const isPasswordValid = await existingUser.isPasswordCorrect(password);

    if(!isPasswordValid){
        throw new ApiError(401, "Invalid password");
    }

    const {accessToken , refreshToken} = await generateAccessAndRefreshToken(existingUser._id);

    const loggedInUser = await User.findById(existingUser._id).select("-password -refreshToken");

    const options = {
        httpOnly : true,
        secure : true
    }

    return res.status(200)
    .cookie("accessToken" , accessToken , options)
    .cookie("refreshToken" , refreshToken , options)
    .json(
        new ApiResponse(
            200,
            {
                user : loggedInUser ,
                accessToken : accessToken,
                refreshToken : refreshToken
            },
            "User Logged In Successfully"
        )
    )

})

const logoutUser = asyncHandler( async (req , res) => {
    // remove refresh token , remove cookies
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset : {
                refreshToken : 1
            }
        },
        {
            new : true
        }
    )

    const options = {
        httpOnly : true,
        secure : true
    }

    return res.status(200)
    .clearCookie("accessToken",options)
    .clearCookie("refreshToken" , options)
    .json(
        new ApiResponse(
            200,
            {},
            "User Logged Out"
        )
    )


})

const refreshAccessToken = asyncHandler( async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;
    if(!incomingRefreshToken){
        throw new ApiError(401,"Unauthorized request")
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken,process.env.REFRESH_TOKEN_SECRET)
    
        const user = await User.findById(decodedToken?._id);
    
        if(!user){
            throw new ApiError(401,"Invalid refresh token");
        }
    
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401,"Refresh Token is expired or invalid");
        }
    
        const options = {
            httpOnly : true,
            secure : true
        }
    
        const {accessToken , newRefreshToken} = await generateAccessAndRefreshToken(user._id);
    
        return res.status(200)
        .cookie("accessToken",accessToken,options)
        .cookie("refreshToken",newRefreshToken,options)
        .json(
            new ApiResponse(
                200,
                {
                    accessToken : accessToken,
                    refreshToken : newRefreshToken
                },
                "Access token refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401 , error?.message || "Invalid refresh token");
    }


})

const changeCurrentPassword = asyncHandler( async (req,res) => {
    const {oldPassword , newPassword} = req.body;

    const user = await User.findById(req.user?._id);
    const checkPassword = await user.isPasswordCorrect(oldPassword);

    if(!checkPassword){
        throw new ApiError(400,"Wrong Password Entered");
    }

    user.password = newPassword;
    await user.save({validateBeforeSave : false})

    return res.status(200)
    .json(
        new ApiResponse(200,{},"Password changed successfully")
    )
})

const getCurrentUser = asyncHandler (async (req,res) => {
    const user = await User.findById(req.user?._id).select("-password -refreshToken");
    if(!user){
        throw new ApiError(501,"Getting user operation failed");
    }

    return res.status(200)
    .json(
        new ApiResponse(
            200,
            {
                user : user
            },
            "The user was returned successfully"
        )
    )
})

const updateAccountDetails = asyncHandler(async (req,res) => {
    const {fullname , email , username} = req.body;
    if(!fullname && !email && !username){
        throw new ApiError(400,"No update information provided");
    }

    const user = await User.findById(req.user?._id).select("-password -refreshToken");

    if(fullname){
        user.fullname = fullname;
    }

    if(email){
        user.email = email;
    }

    if(username){
        user.username = username;
    }

    user.save({validateBeforeSave : false})

    return res.status(200)
    .json(
        new ApiResponse(
            200,
            user,
            "Account details updated successfully"
        )
    )


})

const updateUserAvatar = asyncHandler (async (req,res) => {
    const avatarLocalPath = req.file?.path;

    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar file is missing");
    }

    const avatar = await uploadToCloudinary(avatarLocalPath);

    if(!avatar.url){
        throw new ApiError(500,"Upload to cloudinary failed");
    }

    const olduser = await User.findById(req.user?._id).select("-password -refreshToken");
    const oldAvatarUrl = olduser.avatar;

    await deleteFromCloudinary(oldAvatarUrl,"image");

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set : {
                avatar : avatar.url
            }
        },
        {
            new : true
        }
    ).select("-password -refreshToken")

    return res.status(200)
    .json(
        new ApiResponse(
            200,
            user,
            "Updated user avatar"
        )
    )
})

const updateUserCoverImage = asyncHandler (async (req,res) => {
    const coverImageLocalPath = req.file?.path;

    if(!coverImageLocalPath){
        throw new ApiError(400,"Cover Image file is missing");
    }

    const coverImage = await uploadToCloudinary(coverImageLocalPath);

    if(!coverImage.url){
        throw new ApiError(500,"Upload to cloudinary failed");
    }

    const olduser = await User.findById(req.user?._id).select("-password -refreshToken");
    const oldcoverImageUrl = olduser.coverImage;

    await deleteFromCloudinary(oldcoverImageUrl,"image");

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set : {
                coverImage : coverImage.url
            }
        },
        {
            new : true
        }
    ).select("-password -refreshToken")

    return res.status(200)
    .json(
        new ApiResponse(
            200,
            user,
            "Updated user cover image"
        )
    )
})

const getUserChannelProfile = asyncHandler ( async (req,res) => {
    const {username} = req.params;

    if(!username?.trim()){
        throw new ApiError(400,"User not found")
    }

    const channel = await User.aggregate([
        {
            $match : {
                username : username?.toLowerCase()
            }
        },
        {
            $lookup : {
                from : "subscriptions",
                localField : "_id",
                foreignField : "channel",
                as : "subscribers"
            }
        },
        {
            $lookup : {
                from : "subscriptions",
                localField : "_id",
                foreignField : "subscriber",
                as : "subscribedTo"
            }
        },
        {
            $addFields : {
                subscriberCount : {
                    $size : "$subscribers"
                },
                channelsSubscribedToCount : {
                    $size : "$subscribedTo"
                },
                isSubscribed : {
                    if : {
                        $in : [req.user?._id,"$subscribers.subscriber"]
                    },
                    then : true,
                    else : false
                }
            }
        },
        {
            $project: {
                fullname : 1,
                username : 1,
                avatar : 1,
                coverImage : 1,
                subscriberCount : 1,
                channelsSubscribedToCount : 1,
                isSubscribed : 1,
                createdAt : 1
            }
        }
    ])

    console.log(channel);

    if(!channel?.length){
        throw new ApiError(404,"Channel does not exist")
    }

    return res.status(200)
    .json(
        new ApiResponse(200, channel[0] , "User channel fetched successfuly")
    )

})

const getWatchHistory = asyncHandler ( async (req,res) => {
    const user = await User.aggregate([
        {
            $match : {
                _id : new mongoose.Types.ObjectId.createFromHexString(req.user._id)
            }
        },
        {
            $lookup : {
                from : "videos",
                localField : "watchHistory",
                foreignField : "_id",
                as : "watchHistory",
                pipeline : [
                    {
                        $lookup : {
                            from : "users",
                            localField : "owner",
                            foreignField : "_id",
                            as : "owner",
                            pipeline : [
                                {
                                    $project : {
                                        fullname : 1,
                                        username : 1,
                                        avatar : 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields : {
                            owner : {
                                $first : "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    console.log(user);

    if(!user?.length){
        throw new ApiError(404 , "Watch history not found")
    }

    return res.status(200)
    .json(
        new ApiResponse(
            200,
            user[0].watchHistory,
            "Watch History fetched successfully"
        )
    )
})

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
}

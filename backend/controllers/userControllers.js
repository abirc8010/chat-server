import httpStatus from 'http-status';
import { User } from '../models/users.models.js'; 
import bcrypt from 'bcrypt';
import crypto from 'crypto';


const login = async (req, res) => {
    const { email, password } = req.body;

    
    if (!email || !password) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: "Please enter both email and password" });
    }

    try {
     
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(httpStatus.NOT_FOUND).json({ message: "User does not exist" });
        }

    
        const isValid = await bcrypt.compare(password, user.password);
        if (isValid) {
        
            const token = crypto.randomBytes(20).toString('hex');
            user.token = token;
            user.status = 'online'; 
            await user.save();

            return res.status(httpStatus.OK).json({ 
                message: "Login successful", 
                token: token,
                user: {
                    username: user.username,
                    email: user.email,
                    profilePicture: user.profilePicture,
                    status: user.status
                }
            });
        } else {
            return res.status(httpStatus.UNAUTHORIZED).json({ message: "Invalid password" });
        }
    } catch (error) {
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: `Oops! Something went wrong: ${error}` });
    }
};


const register = async (req, res) => {
    const { email, username, password } = req.body;

 
    if (!email || !username || !password) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: "Please enter email, username, and password" });
    }

    try {
     
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(httpStatus.CONFLICT).json({ message: "User with this email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            email,
            username,
            password: hashedPassword,
            profilePicture: 'you.webp',  
            status: 'offline'  
        });

        await newUser.save();

        return res.status(httpStatus.CREATED).json({ message: "User registered successfully" });
    } catch (error) {
        return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: `Oops! Something went wrong: ${error}` });
    }
};

export { login, register };

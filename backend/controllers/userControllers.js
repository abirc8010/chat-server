import httpStatus from "http-status";
import { User } from "../models/users.models.js";
import { Message } from "../models/messages.models.js";
import { Groups } from "../models/groups.models.js";
import bcrypt from "bcrypt";
import crypto from "crypto";

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "Please enter both email and password" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json({ message: "User does not exist" });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (isValid) {
      const token = crypto.randomBytes(20).toString("hex");
      user.token = token;
      user.status = "online";
      await user.save();

      return res.status(httpStatus.OK).json({
        message: "Login successful",
        token: token,
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          profilePicture: user.profilePicture,
          status: user.status,
        },
      });
    } else {
      return res
        .status(httpStatus.UNAUTHORIZED)
        .json({ message: "Invalid password" });
    }
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Oops! Something went wrong: ${error}` });
  }
};

const register = async (req, res) => {
  const { email, username, password } = req.body;

  if (!email || !username || !password) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "Please enter email, username, and password" });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(httpStatus.CONFLICT)
        .json({ message: "User with this email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      email,
      username,
      password: hashedPassword,
      profilePicture: "you.webp",
      status: "offline",
    });

    await newUser.save();

    return res
      .status(httpStatus.CREATED)
      .json({ message: "User registered successfully" });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Oops! Something went wrong: ${error}` });
  }
};

const validateToken = async (req, res) => {
  const { email, token } = req.body;
  if (!email || !token) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "Email and token are required" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json({ message: "User not found" });
    }

    if (user.token === token) {
      return res.status(httpStatus.OK).json({
        message: "Token is valid",
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          profilePicture: user.profilePicture,
          status: user.status,
        },
      });
    } else {
      return res
        .status(httpStatus.UNAUTHORIZED)
        .json({ message: "Invalid token" });
    }
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Error validating token: ${error}` });
  }
};

const getContacts = async (req, res) => {
  try {
    const { email } = req.query;
    const user = await User.findOne({ email })
      .populate("contacts", "_id username email profilePicture")
      .populate("groups", "_id groupName groupPicture");

    if (!user) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json({ message: "User not found" });
    }

    const contactsWithType = user.contacts.map((contact) => ({
      ...contact.toObject(),
      type: "Private",
    }));

    const groupsWithType = user.groups.map((group) => ({
      ...group.toObject(),
      type: "Group",
    }));

    return res.status(httpStatus.OK).json({
      contacts: contactsWithType,
      groups: groupsWithType,
    });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Error fetching contacts: ${error.message}` });
  }
};

const addContact = async (req, res) => {
  const { userEmail, contactEmail } = req.body;

  if (!userEmail || !contactEmail) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "Both userEmail and contactEmail are required." });
  }

  try {
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json({ message: "User not found." });
    }
    const contactUser = await User.findOne({ email: contactEmail });
    if (!contactUser) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json({ message: "Contact user not found." });
    }

    if (!user.contacts.includes(contactUser._id)) {
      user.contacts.push(contactUser._id);
      await user.save();
    }
    if (!contactUser.contacts.includes(user._id)) {
      contactUser.contacts.push(user._id);
      await contactUser.save();
    }

    return res
      .status(httpStatus.OK)
      .json({ message: "Contact added successfully." });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Error adding contact: ${error.message}` });
  }
};

const getMessages = async (req, res) => {
  const { senderEmail, receiverEmail, groupId } = req.query;
  if (!senderEmail && !receiverEmail && !groupId) {
    return res.status(httpStatus.BAD_REQUEST).json({
      message: "Either sender and receiver emails or group ID are required.",
    });
  }

  try {
    if (groupId) {
      const messages = await Message.find({
        "receiver.type": "Group",
        "receiver.id": groupId,
      })
        .populate("sender", "email username")
        .populate("receiver.id", "name")
        .populate("replyTo", "content");
      return res.status(httpStatus.OK).json(messages);
    } else {
      const sender = await User.findOne({ email: senderEmail });
      const receiver = await User.findOne({ email: receiverEmail });

      if (!sender || !receiver) {
        return res
          .status(httpStatus.NOT_FOUND)
          .json({ message: "User not found." });
      }

      const messages = await Message.find({
        $or: [
          { sender: sender._id, receiver: { type: "User", id: receiver._id } },
          { sender: receiver._id, receiver: { type: "User", id: sender._id } },
        ],
      })
        .populate("sender", "email username")
        .populate("receiver.id", "email username");

      return res.status(httpStatus.OK).json(messages);
    }
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Error fetching messages: ${error.message}` });
  }
};

const getSearchResults = async (req, res) => {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  try {
    const users = await User.find({
      email: new RegExp("^" + query, "i"),
    }).limit(5);

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Error fetching users" });
  }
};

const changeProfilePicture = async (req, res) => {
  const { id } = req.params;
  const { profilePicture } = req.body;

  if (!profilePicture) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "Profile picture is required." });
  }

  try {
    const user = await User.findById(id);

    if (!user) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json({ message: "User not found." });
    }

    user.profilePicture = profilePicture;
    await user.save();

    return res.status(httpStatus.OK).json({
      message: "Profile picture updated successfully.",
      profilePicture: user.profilePicture,
    });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Error updating profile picture: ${error.message}` });
  }
};

const getGroupMembers = async (req, res) => {
  const { groupId } = req.params;

  if (!groupId) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "Group ID is required." });
  }

  try {
    const group = await Groups.findById(groupId).populate(
      "members",
      "_id username email profilePicture"
    );

    if (!group) {
      return res
        .status(httpStatus.NOT_FOUND)
        .json({ message: "Group not found." });
    }

    const members = group.members.map((member) => ({
      _id: member._id,
      username: member.username,
      email: member.email,
      profilePicture: member.profilePicture,
    }));
    return res.status(httpStatus.OK).json({ members, admin: group.admin });
  } catch (error) {
    return res
      .status(httpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: `Error fetching group members: ${error.message}` });
  }
};
export {
  login,
  register,
  validateToken,
  getContacts,
  addContact,
  getMessages,
  getSearchResults,
  changeProfilePicture,
  getGroupMembers,
};

import { Router } from "express";
import {
  login,
  register,
  validateToken,
  getContacts,
  addContact,
  getMessages,
  getSearchResults,
  changeProfilePicture,
  getGroupMembers,
} from "../controllers/userControllers.js";
const router = Router();
router.route("/login").post(login);
router.route("/register").post(register);
router.route("/validate-token").post(validateToken);
router.route("/contacts").get(getContacts);
router.route("/add-contact").post(addContact);
router.route("/messages").get(getMessages);
router.route("/change-profile-picture/:id").post(changeProfilePicture);
router.route("/search").get(getSearchResults);
router.route("/group-members/:groupId").get(getGroupMembers);
export default router;

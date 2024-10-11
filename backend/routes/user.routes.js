import { Router } from "express";
import {
  login,
  register,
  validateToken,
  getContacts,
  addContact,
  getMessagesBetweenUsers,
  getSearchResults,
} from "../controllers/userControllers.js";
const router = Router();
router.route("/login").post(login);
router.route("/register").post(register);
router.route("/validate-token").post(validateToken);
router.route("/contacts").get(getContacts);
router.route("/add-contact").post(addContact);
router.route("/messages").get(getMessagesBetweenUsers);
router.route("/search").get(getSearchResults);
export default router;

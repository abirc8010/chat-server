import mongoose from "mongoose";
const PreferencesSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  chatBackground: {
    type: String,
    default: "light",
  },
});
const Preferences = mongoose.model("Preferences", PreferencesSchema);
export { Preferences };

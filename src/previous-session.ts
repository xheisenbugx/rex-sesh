import { showFailureToast } from "@raycast/utils";
import { activateApp, clientAction } from "./lib/rex";

export default async function Command() {
  try {
    await activateApp();
    await clientAction("session.previous");
  } catch (error) {
    await showFailureToast(error, { title: "Could not switch session" });
  }
}

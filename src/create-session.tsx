import { Action, ActionPanel, Form, Icon, Toast, closeMainWindow, popToRoot, showToast } from "@raycast/api";
import { showFailureToast, useForm } from "@raycast/utils";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { expandHome } from "./lib/paths";
import { connectPath } from "./lib/sessions";

interface Values {
  directory: string[];
  path: string;
  name: string;
  startup: string;
}

export function CreateSessionForm(props: {
  initialPath?: string;
  initialName?: string;
  initialStartup?: string;
  onCreated?: () => void;
}) {
  const { handleSubmit, itemProps } = useForm<Values>({
    initialValues: {
      directory: props.initialPath ? [props.initialPath] : [],
      path: "",
      name: props.initialName ?? "",
      startup: props.initialStartup ?? "",
    },
    validation: {
      path: (value) => {
        if (!value?.trim()) return undefined;
        const p = expandHome(value.trim());
        if (!existsSync(p) || !statSync(p).isDirectory()) return "Directory not found";
      },
    },
    async onSubmit(values) {
      const path = values.path.trim() ? expandHome(values.path.trim()) : values.directory[0];
      if (!path) {
        await showToast({ style: Toast.Style.Failure, title: "Choose a directory" });
        return;
      }
      const toast = await showToast({ style: Toast.Style.Animated, title: "Creating session" });
      try {
        await connectPath({
          path,
          name: values.name,
          // An empty field means "use the configured default"; a single space means none.
          startupCommand: values.startup === "" ? undefined : values.startup,
        });
        toast.hide();
        props.onCreated?.();
        await closeMainWindow({ clearRootSearch: true });
        await popToRoot();
      } catch (error) {
        toast.hide();
        await showFailureToast(error, { title: "Could not create session" });
      }
    },
  });

  return (
    <Form
      navigationTitle="Create Rex Session"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Session" icon={Icon.Plus} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        title="Directory"
        allowMultipleSelection={false}
        canChooseDirectories
        canChooseFiles={false}
        storeValue={!props.initialPath}
        {...itemProps.directory}
      />
      <Form.TextField
        title="Or Path"
        placeholder={`~/code/project (overrides the picker)`}
        info={`Type a path instead of picking one. ~ expands to ${homedir()}.`}
        {...itemProps.path}
      />
      <Form.Separator />
      <Form.TextField
        title="Session Name"
        placeholder="Defaults to the Git repository or folder name"
        info="If a session with this name exists, Rex switches to it instead of creating another."
        {...itemProps.name}
      />
      <Form.TextField
        title="Startup Command"
        placeholder="Defaults to [default_session].startup_command"
        info="Typed into the first tab's shell. {} is replaced with the quoted session path. Enter a single space to run nothing."
        {...itemProps.startup}
      />
    </Form>
  );
}

export default function Command() {
  return <CreateSessionForm />;
}

import { Action, ActionPanel, Form, Icon, Toast, showToast, useNavigation } from "@raycast/api";
import { showFailureToast, useForm } from "@raycast/utils";
import { RexSession, renameSession } from "./lib/rex";

export function RenameForm({ session, onRenamed }: { session: RexSession; onRenamed: () => void }) {
  const { pop } = useNavigation();
  const { handleSubmit, itemProps } = useForm<{ label: string }>({
    initialValues: { label: session.label },
    validation: { label: (v) => (v?.trim() ? undefined : "Enter a name") },
    async onSubmit({ label }) {
      try {
        await renameSession(session.id, label.trim());
        await showToast({ style: Toast.Style.Success, title: `Renamed to ${label.trim()}` });
        onRenamed();
        pop();
      } catch (error) {
        await showFailureToast(error, { title: "Could not rename session" });
      }
    },
  });

  return (
    <Form
      navigationTitle={`Rename ${session.label}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Rename Session" icon={Icon.Text} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField title="Name" autoFocus {...itemProps.label} />
    </Form>
  );
}

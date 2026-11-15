import {
  Action,
  ActionPanel,
  Alert,
  Color,
  Icon,
  List,
  Toast,
  closeMainWindow,
  confirmAlert,
  getPreferenceValues,
  open,
  showToast,
} from "@raycast/api";
import { showFailureToast, useCachedPromise, useCachedState, usePromise } from "@raycast/utils";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { SeshConfig, Source, defaultConfigPath } from "./lib/config";
import { shortenHome } from "./lib/paths";
import { renderPreview } from "./lib/preview";
import { killSession } from "./lib/rex";
import { Entry, connectEntry, loadEntries } from "./lib/sessions";
import { CreateSessionForm } from "./create-session";
import { RenameForm } from "./rename-form";
import { ResolvedShortcuts, resolveShortcuts } from "./lib/shortcuts";
import { useEffect, useMemo } from "react";

const SOURCE_META: Record<Source, { title: string; icon: Icon; tint: Color }> = {
  rex: { title: "Rex Sessions", icon: Icon.Terminal, tint: Color.Green },
  config: { title: "Configured", icon: Icon.Gear, tint: Color.Blue },
  zoxide: { title: "Zoxide", icon: Icon.Folder, tint: Color.SecondaryText },
};

type Filter = "all" | Source;

export default function Command() {
  const { showPreview } = getPreferenceValues<Preferences>();
  const [filter, setFilter] = useCachedState<Filter>("filter", "all");
  const [showingDetail, setShowingDetail] = useCachedState<boolean>("showDetail", showPreview);
  const { data, isLoading, revalidate } = useCachedPromise(loadEntries, [], { keepPreviousData: true });
  const { shortcuts, problems } = useMemo(resolveShortcuts, []);

  useEffect(() => {
    if (problems.length === 0) return;
    showToast({
      style: Toast.Style.Failure,
      title: problems.length === 1 ? "Invalid shortcut preference" : `${problems.length} invalid shortcut preferences`,
      message: problems.join("\n"),
    });
  }, [problems]);

  const entries = data?.entries ?? [];
  const order = data?.config.sort_order ?? (["rex", "config", "zoxide"] as Source[]);
  const visible = order.filter((s) => filter === "all" || filter === s);

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={showingDetail && entries.length > 0}
      searchBarPlaceholder="Connect to a session or directory…"
      searchBarAccessory={
        <List.Dropdown tooltip="Source" value={filter} onChange={(v) => setFilter(v as Filter)}>
          <List.Dropdown.Item title="All Sources" value="all" icon={Icon.List} />
          {(Object.keys(SOURCE_META) as Source[]).map((s) => (
            <List.Dropdown.Item key={s} title={SOURCE_META[s].title} value={s} icon={SOURCE_META[s].icon} />
          ))}
        </List.Dropdown>
      }
    >
      <List.EmptyView
        icon={Icon.Terminal}
        title={isLoading ? "Loading sessions…" : "No sessions"}
        description="Create a session from a directory with ⌘N."
        actions={
          <ActionPanel>
            <Action.Push
              title="Create Session"
              icon={Icon.Plus}
              target={<CreateSessionForm onCreated={revalidate} />}
            />
          </ActionPanel>
        }
      />
      {visible.map((source) => (
        <List.Section key={source} title={SOURCE_META[source].title}>
          {entries
            .filter((e) => e.source === source)
            .map((entry) => (
              <EntryItem
                key={entry.key}
                entry={entry}
                config={data!.config}
                showingDetail={showingDetail}
                toggleDetail={() => setShowingDetail((v) => !v)}
                shortcuts={shortcuts}
                revalidate={revalidate}
              />
            ))}
        </List.Section>
      ))}
    </List>
  );
}

function EntryItem(props: {
  entry: Entry;
  config: SeshConfig;
  showingDetail: boolean;
  toggleDetail: () => void;
  revalidate: () => void;
  shortcuts: ResolvedShortcuts["shortcuts"];
}) {
  const { entry, config, showingDetail, toggleDetail, revalidate, shortcuts } = props;
  const meta = SOURCE_META[entry.source];
  const path = entry.path ? shortenHome(entry.path) : undefined;

  const accessories: List.Item.Accessory[] = [];
  if (!showingDetail) {
    if (entry.session?.program) accessories.push({ tag: entry.session.program, tooltip: "Foreground program" });
    if (entry.session && entry.session.windowCount > 0) {
      accessories.push({ icon: Icon.AppWindowGrid2x2, text: String(entry.session.windowCount), tooltip: "Tabs" });
    }
  }

  return (
    <List.Item
      icon={{ source: meta.icon, tintColor: meta.tint }}
      title={entry.title}
      subtitle={entry.source !== "zoxide" && !showingDetail ? path : undefined}
      keywords={[entry.source, ...(path ? path.split("/") : [])]}
      accessories={accessories}
      detail={showingDetail ? <EntryDetail entry={entry} config={config} /> : undefined}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action
              title={entry.session ? "Switch to Session" : "Create Session"}
              icon={entry.session ? Icon.ArrowRight : Icon.Plus}
              onAction={() => connect(entry, config, revalidate)}
            />
            {entry.path && (
              <Action.Push
                title="Create Session with Options…"
                icon={Icon.Pencil}
                shortcut={shortcuts.shortcutConnectWithOptions}
                target={
                  <CreateSessionForm
                    initialPath={entry.path}
                    initialName={entry.config?.name}
                    initialStartup={entry.config?.startup_command}
                    onCreated={revalidate}
                  />
                }
              />
            )}
          </ActionPanel.Section>
          {entry.session && (
            <ActionPanel.Section title="Session">
              <Action.Push
                title="Rename Session"
                icon={Icon.Text}
                shortcut={shortcuts.shortcutRename}
                target={<RenameForm session={entry.session} onRenamed={revalidate} />}
              />
              <Action
                title="Kill Session"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                shortcut={shortcuts.shortcutKill}
                onAction={() => kill(entry, revalidate)}
              />
            </ActionPanel.Section>
          )}
          <ActionPanel.Section>
            <Action
              title={showingDetail ? "Hide Preview" : "Show Preview"}
              icon={Icon.Sidebar}
              shortcut={shortcuts.shortcutTogglePreview}
              onAction={toggleDetail}
            />
            <Action.Push
              title="New Session…"
              icon={Icon.Plus}
              shortcut={shortcuts.shortcutNewSession}
              target={<CreateSessionForm onCreated={revalidate} />}
            />
            <Action
              title="Refresh"
              icon={Icon.ArrowClockwise}
              shortcut={shortcuts.shortcutRefresh}
              onAction={revalidate}
            />
          </ActionPanel.Section>
          {entry.path && (
            <ActionPanel.Section title="Directory">
              <Action.ShowInFinder path={entry.path} shortcut={shortcuts.shortcutShowInFinder} />
              <Action.CopyToClipboard title="Copy Path" content={entry.path} shortcut={shortcuts.shortcutCopyPath} />
            </ActionPanel.Section>
          )}
          <ActionPanel.Section>
            <Action
              title="Edit Config"
              icon={Icon.Document}
              shortcut={shortcuts.shortcutEditConfig}
              onAction={() => openConfig(config)}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function EntryDetail({ entry, config }: { entry: Entry; config: SeshConfig }) {
  const { data, isLoading } = usePromise(renderPreview, [entry, config]);
  const meta = SOURCE_META[entry.source];
  return (
    <List.Item.Detail
      isLoading={isLoading}
      markdown={data}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.TagList title="Source">
            <List.Item.Detail.Metadata.TagList.Item text={meta.title} color={meta.tint} />
          </List.Item.Detail.Metadata.TagList>
          {entry.path && <List.Item.Detail.Metadata.Label title="Path" text={shortenHome(entry.path)} />}
          {entry.session?.program && <List.Item.Detail.Metadata.Label title="Program" text={entry.session.program} />}
          {entry.session && <List.Item.Detail.Metadata.Label title="Tabs" text={String(entry.session.windowCount)} />}
          {entry.config?.startup_command && (
            <List.Item.Detail.Metadata.Label title="Startup" text={entry.config.startup_command} />
          )}
          {entry.config?.windows?.length ? (
            <List.Item.Detail.Metadata.Label title="Windows" text={entry.config.windows.join(", ")} />
          ) : null}
          {entry.score !== undefined && (
            <List.Item.Detail.Metadata.Label title="Zoxide Score" text={entry.score.toFixed(1)} />
          )}
        </List.Item.Detail.Metadata>
      }
    />
  );
}

async function connect(entry: Entry, config: SeshConfig, revalidate: () => void) {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: entry.session ? `Switching to ${entry.title}` : `Opening ${entry.title}`,
  });
  try {
    await connectEntry(entry, config);
    toast.hide();
    await closeMainWindow({ clearRootSearch: true });
    revalidate();
  } catch (error) {
    toast.hide();
    await showFailureToast(error, { title: "Could not connect" });
  }
}

async function kill(entry: Entry, revalidate: () => void) {
  if (!entry.session) return;
  const confirmed = await confirmAlert({
    title: `Kill “${entry.title}”?`,
    message: "This closes every tab and pane in the session.",
    icon: { source: Icon.Trash, tintColor: Color.Red },
    primaryAction: { title: "Kill Session", style: Alert.ActionStyle.Destructive },
  });
  if (!confirmed) return;
  try {
    await killSession(entry.session.id);
    await showToast({ style: Toast.Style.Success, title: `Killed ${entry.title}` });
    revalidate();
  } catch (error) {
    await showFailureToast(error, { title: "Could not kill session" });
  }
}

async function openConfig(config: SeshConfig) {
  const file = config.file ?? defaultConfigPath();
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, STARTER_CONFIG);
  }
  await open(file);
}

const STARTER_CONFIG = `#:schema https://github.com/joshmedeski/sesh/raw/main/sesh.schema.json
# Rex Sesh reads the same format as sesh.toml.

[default_session]
# startup_command = "nvim"
# preview_command = "eza --all --git --icons=always --color=always {}"

# [[session]]
# name = "dotfiles"
# path = "~/.config"
# startup_command = "nvim"
# windows = ["git"]

# [[window]]
# name = "git"
# startup_script = "lazygit"
`;

import { Prompt } from "../component/prompt";
import { Logo } from "../component/logo";
import { Tips } from "../component/tips";
import { Toast } from "../ui/toast";
import { useTheme } from "../context/theme";

export function Home(props: { projectPath?: string; version?: string }) {
  const { theme } = useTheme();

  return (
    <box flexDirection="column" flexGrow={1} width="100%" height="100%" backgroundColor={theme.background}>
      <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2} flexDirection="column">
        <box flexGrow={1} minHeight={0} />
        <box height={4} minHeight={0} flexShrink={1} />
        <box flexShrink={0}>
          <Logo />
        </box>
        <box height={1} minHeight={0} flexShrink={1} />
        <box width="100%" maxWidth={75} zIndex={1000} paddingTop={1} flexShrink={0}>
          <Prompt />
        </box>
        <box height={4} minHeight={0} width="100%" maxWidth={75} alignItems="center" paddingTop={3} flexShrink={1} flexDirection="column">
          <Tips />
        </box>
        <box flexGrow={1} minHeight={0} />
        <Toast />
      </box>
      <box paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={2} flexDirection="row" flexShrink={0} gap={2}>
        <text fg={theme.textMuted}>{props.projectPath ?? process.cwd()}</text>
        <box flexGrow={1} />
        <box flexShrink={0}>
          <text fg={theme.textMuted}>{props.version ?? "changeyard"}</text>
        </box>
      </box>
    </box>
  );
}

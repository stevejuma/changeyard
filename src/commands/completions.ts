export function runCompletions(): string {
  return `_cy_complete() {
  local commands="--tui -i --dashboard --kanban --vcs --version init update create validate sync start verify hydrate complete next land workspace review doctor recover repair note mark-in-progress list status plan hub config completions version help"
  COMPREPLY=( $(compgen -W "$commands" -- "\${COMP_WORDS[COMP_CWORD]}") )
}
complete -F _cy_complete cy changeyard`;
}

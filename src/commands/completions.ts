export function runCompletions(): string {
  return `_cy_complete() {
  local commands="init update create validate sync start verify hydrate complete next land workspace review doctor recover list status plan ui server tui config completions help"
  COMPREPLY=( $(compgen -W "$commands" -- "\${COMP_WORDS[COMP_CWORD]}") )
}
complete -F _cy_complete cy changeyard`;
}

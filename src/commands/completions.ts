export function runCompletions(): string {
  return `_cy_complete() {
  local commands="init create validate sync start verify hydrate complete review doctor recover list status completions help"
  COMPREPLY=( $(compgen -W "$commands" -- "\${COMP_WORDS[COMP_CWORD]}") )
}
complete -F _cy_complete cy changeyard`;
}

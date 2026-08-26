type ServerWithSshSecret = {
  agentSshPasswordEnc?: string | null;
  [key: string]: unknown;
};

export function publicStreamServer<T extends ServerWithSshSecret>(server: T) {
  const { agentSshPasswordEnc, ...rest } = server;
  return {
    ...rest,
    sshPasswordSet: Boolean(agentSshPasswordEnc),
  };
}

window.__ModuleLoader__.load({
  id: '@local/mditor-bridge',
  factory() {
    return {
      inject: ['uiWorkspace'],
      apply(ctx) {
        ctx.effect(() => {
          const seen = new Set();
          const es = new EventSource('/__mditor_bridge/events');

          const onDraft = async (event) => {
            let payload;
            try {
              payload = JSON.parse(event.data);
            } catch {
              return;
            }
            if (!payload || typeof payload.prompt !== 'string' || !payload.prompt.trim()) {
              return;
            }
            if (payload.id) {
              if (seen.has(payload.id)) return;
              seen.add(payload.id);
              if (seen.size > 100) {
                const first = seen.values().next().value;
                seen.delete(first);
              }
            }

            let workspaceId;
            const workspaces = ctx.get('workspaces');
            if (payload.cwd && workspaces && typeof workspaces.create === 'function') {
              try {
                const ws = await workspaces.create({ path: payload.cwd });
                if (ws && ws.workspaceId) {
                  workspaceId = ws.workspaceId;
                }
              } catch (err) {
                console.warn('[mditor-bridge] Failed to resolve workspace for cwd, falling back:', err);
              }
            }

            try {
              ctx.uiWorkspace.startSession(workspaceId, {
                prompt: payload.prompt,
                whenDraftExists: 'replace',
              });
            } catch (err) {
              console.error('[mditor-bridge] Failed to open draft session:', err);
            }
          };

          es.addEventListener('mditor-draft', onDraft);

          return () => {
            es.removeEventListener('mditor-draft', onDraft);
            es.close();
          };
        });
      },
    };
  },
});

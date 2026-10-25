import Alert, { type AlertColor } from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import React, { createContext, useCallback, useContext, useRef, useState } from "react";

interface Notice {
  id: number;
  message: string;
  severity: AlertColor;
}

interface NotificationsContextValue {
  notify: (message: string, severity?: AlertColor) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(
  null
);

export function NotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const nextId = useRef(1);

  const notify = useCallback((message: string, severity: AlertColor = "info") => {
    setNotices((current) => [
      ...current,
      { id: nextId.current++, message, severity },
    ]);
  }, []);

  const current = notices[0];

  const close = useCallback(() => {
    setNotices((current) => current.slice(1));
  }, []);

  return (
    <NotificationsContext.Provider value={{ notify }}>
      {children}
      <Snackbar
        key={current?.id}
        open={Boolean(current)}
        autoHideDuration={current?.severity === "error" ? 8000 : 4000}
        onClose={(_, reason) => {
          if (reason === "clickaway") return;
          close();
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {current ? (
          <Alert
            severity={current.severity}
            variant="filled"
            onClose={close}
            sx={{ maxWidth: 560 }}
          >
            {current.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </NotificationsContext.Provider>
  );
}

export function useNotify(): NotificationsContextValue["notify"] {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error("NotificationsProvider is missing");
  return value.notify;
}

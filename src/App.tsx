import {
  createTheme,
  CssBaseline,
  GlobalStyles,
  ThemeProvider,
} from "@mui/material";
import React, { useMemo } from "react";
import Main from "./Main";
import ErrorBoundary from "./app/ErrorBoundary";
import { NotificationsProvider } from "./app/notifications";
import { PreferencesProvider, useResolvedTheme } from "./app/preferences";
import { TransferQueueProvider } from "./app/transferQueue";

const globalStyles = (
  <GlobalStyles
    styles={{
      "html, body, #root": { height: "100%" },
      body: { margin: 0, overflow: "hidden" },
      "code": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
    }}
  />
);

function ThemedApp() {
  const mode = useResolvedTheme();
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: { main: "#f38020" },
          ...(mode === "dark"
            ? {
                background: { default: "#0f172a", paper: "#111c2e" },
                divider: "rgba(148, 163, 184, 0.18)",
              }
            : {
                background: { default: "#f7f8fa", paper: "#ffffff" },
              }),
        },
        shape: { borderRadius: 10 },
        typography: {
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        },
        components: {
          MuiButton: {
            styleOverrides: {
              root: { textTransform: "none" },
            },
          },
          MuiTooltip: {
            defaultProps: { arrow: true },
          },
        },
      }),
    [mode]
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      {globalStyles}
      <TransferQueueProvider>
        <NotificationsProvider>
          <ErrorBoundary>
            <Main />
          </ErrorBoundary>
        </NotificationsProvider>
      </TransferQueueProvider>
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <PreferencesProvider>
      <ThemedApp />
    </PreferencesProvider>
  );
}

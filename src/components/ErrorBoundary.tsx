import React, { Component, ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, Appearance } from 'react-native';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * App-wide error boundary. A render-time throw anywhere in the screen tree
 * (a malformed API response, a `parseFloat` on an unexpectedly-shaped coord, an
 * undefined access in a feed card) would otherwise crash the app to a blank/red
 * screen with no recovery. This catches it and shows a "Try again" fallback.
 *
 * Class component because error boundaries require `componentDidCatch` /
 * `getDerivedStateFromError` — there is no hook equivalent.
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // eslint-disable-next-line no-console
    console.error('Uncaught render error:', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const isDark = Appearance.getColorScheme() === 'dark';
    const bg = isDark ? '#000' : '#fff';
    const fg = isDark ? '#fff' : '#0f172a';
    const sub = isDark ? '#94a3b8' : '#64748b';

    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <Text style={[styles.title, { color: fg }]}>Something went wrong</Text>
        <Text style={[styles.subtitle, { color: sub }]}>
          We hit an unexpected error. Try again — if it keeps happening, please contact support.
        </Text>
        <Pressable style={styles.button} onPress={this.handleReset}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    marginTop: 8,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default ErrorBoundary;

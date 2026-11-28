import { Component, type ReactNode } from "react";

/** Art is optional; a failed scene download must not take down a running timer. */
export default class SceneErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="scene-loading" role="status">
        모험 장면을 불러오지 못했어요. 타이머는 계속 진행돼요.
      </div>
    );
  }
}

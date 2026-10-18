export const GET_INTERCEPT_STATUS_QUERY = `
  query AgentSafeInterceptStatus { interceptStatus }
`;

export const PAUSE_INTERCEPT_MUTATION = `
  mutation AgentSafePauseIntercept { pauseIntercept { status } }
`;

export const RESUME_INTERCEPT_MUTATION = `
  mutation AgentSafeResumeIntercept { resumeIntercept { status } }
`;

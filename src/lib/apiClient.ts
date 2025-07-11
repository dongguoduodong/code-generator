/**
 * 一个全局的、非钩子的API客户端。
 * 在遇到401未授权错误时，会派发一个全局自定义事件'auth:session-expired'。
 */
export const apiClient = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  const response = await fetch(input, init);

  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent("auth:session-expired"));

    throw new Error("Session expired");
  }

  return response;
};

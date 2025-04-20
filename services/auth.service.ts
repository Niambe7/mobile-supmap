import api from "./api";

export const loginUser = async (email: string, password: string) => {
  try {
    const res = await api.post("/auth/auth/login", { email, password });
    return res.data;
  } catch (err: any) {
    throw new Error(err.response?.data?.message || "Erreur de connexion");
  }
};

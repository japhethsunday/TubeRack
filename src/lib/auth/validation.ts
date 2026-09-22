import { z } from "zod";
import { passwordScore } from "@/src/lib/auth/password";

const email = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .email("Enter a valid email address, like you@studio.com.");

const password = z
  .string()
  .min(1, "Enter your password.")
  .min(8, "Use at least 8 characters.")
  .refine((v) => passwordScore(v).score >= 2, {
    message: "Choose a stronger password — mix cases, numbers, or symbols.",
  });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});

export const signupSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name.").max(80, "Keep your name under 80 characters."),
    email,
    password,
    confirm: z.string().min(1, "Confirm your password."),
    terms: z.literal(true, {
      message: "Accept the terms to create an account.",
    }),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

export const forgotSchema = z.object({ email });

export const resetSchema = z
  .object({
    token: z.string().min(1, "Reset link is missing its token."),
    password,
    confirm: z.string().min(1, "Confirm your new password."),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    password,
    confirm: z.string().min(1, "Confirm your new password."),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80, "Keep your name under 80 characters."),
  username: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]*$/, "Use lowercase letters, numbers, and dashes only.")
    .max(40, "Keep your username under 40 characters.")
    .optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;

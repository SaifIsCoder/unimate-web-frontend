import React from "react";
import Alert from "@/components/ui/alert/Alert";

export type Feedback = {
  variant: "success" | "error";
  title: string;
  message: string;
} | null;

/** Renders the result of the last mutation, or nothing. */
export default function FeedbackBanner({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;

  return (
    <Alert
      variant={feedback.variant}
      title={feedback.title}
      message={feedback.message}
    />
  );
}

/** Turns an unknown throwable into a message worth showing a user. */
export const errorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

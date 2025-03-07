import { useToast as useToastPrimitive } from "@/components/ui/toast";

export function useToast() {
  const { toast } = useToastPrimitive();
  return { toast };
}

export type { Toast } from "@/components/ui/toast"; 
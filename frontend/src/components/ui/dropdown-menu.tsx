import * as React from 'react';
import * as D from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

export const DropdownMenu = D.Root;
export const DropdownMenuTrigger = D.Trigger;
export const DropdownMenuContent = React.forwardRef<React.ElementRef<typeof D.Content>, React.ComponentPropsWithoutRef<typeof D.Content>>(({ className, sideOffset = 4, ...p }, ref) => (
  <D.Portal><D.Content ref={ref} sideOffset={sideOffset} className={cn('z-50 min-w-[12rem] overflow-hidden rounded-md border bg-white p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0', className)} {...p} /></D.Portal>
));
DropdownMenuContent.displayName = 'DropdownMenuContent';
export const DropdownMenuItem = React.forwardRef<React.ElementRef<typeof D.Item>, React.ComponentPropsWithoutRef<typeof D.Item>>(({ className, ...p }, ref) => (
  <D.Item ref={ref} className={cn('relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent data-[disabled]:opacity-50', className)} {...p} />
));
DropdownMenuItem.displayName = 'DropdownMenuItem';
export const DropdownMenuSeparator = () => <D.Separator className="-mx-1 my-1 h-px bg-border" />;

import { buttonVariants } from '@/components/ui/button';
import { cn } from 'cn';

export default function LogoutButton(){
    return (
        <a
            href='/login'
            className={cn(buttonVariants({variant:'secondary', size:'sm'}), 'hover:bg-[#c2185b] hover:text-white hover:font-semibold')}
        >
            Logout
        </a>
    )
}
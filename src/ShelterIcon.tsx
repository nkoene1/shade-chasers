import type { SVGProps } from 'react';

export function ShelterIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false" {...props}>
			<path
				d="M4.5 15.2 16 5.4l11.5 9.8"
				stroke="currentColor"
				strokeWidth="3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M7.8 14.4v11.2h16.4V14.4"
				stroke="currentColor"
				strokeWidth="3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M13 25.6v-7.2h6v7.2"
				stroke="currentColor"
				strokeWidth="3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

import { closePools, deleteE2eUsers } from "./db";

// Sweeps leftovers from a crashed run before starting, and again afterwards
export default async function globalSetup() {
	await deleteE2eUsers();

	return async () => {
		await deleteE2eUsers();
		await closePools();
	};
}

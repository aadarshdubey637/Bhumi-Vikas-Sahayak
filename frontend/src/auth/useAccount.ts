import { useContext } from "react";
import { AccountContext } from "./accountContext";

export const useAccount = () => useContext(AccountContext);

import { AuthenticationCreds, AuthenticationState, BufferJSON, initAuthCreds, proto, SignalDataTypeMap } from "@adiwajshing/baileys";
import Database from "../libs/database.libs";

export default class AuthMulti {
  public useDatabaseAuth = async (): Promise<{ state: AuthenticationState; saveState: () => Promise<void>; clearState: () => Promise<void> }> => {
    const fixFileName = (fileName?: string): string => fileName?.replace(/\//g, "__")?.replace(/:/g, "-");

    const writeData = async (data: unknown, fileName: string): Promise<void> => {
      const getSession = await this.DB.getSession(fixFileName(fileName));
      if (getSession && getSession.session) await this.DB.updateSession(fixFileName(fileName), JSON.stringify(data, BufferJSON.replacer));
      else await this.DB.createSession(fixFileName(fileName), JSON.stringify(data, BufferJSON.replacer));
    };

    const readData = async (fileName: string): Promise<AuthenticationCreds> => {
      try {
        const data = await this.DB.getSession(fixFileName(fileName));
        return JSON.parse(data.session, BufferJSON.reviver) as AuthenticationCreds;
      } catch {
        return null;
      }
    };

    const removeData = async (fileName: string): Promise<void> => {
      await this.DB.deleteSession(fixFileName(fileName));
    };

    const creds: AuthenticationCreds = (await readData("creds")) || initAuthCreds();

    return {
      state: {
        creds,
        keys: {
          get: async (type, ids) => {
            const data: { [_: string]: SignalDataTypeMap[typeof type] } = {};
            await Promise.all(
              ids.map(async (id) => {
                let fixValue: proto.Message.AppStateSyncKeyData;
                const value = await readData(`${type}-${id}`);
                if (type === "app-state-sync-key" && value) {
                  fixValue = proto.Message.AppStateSyncKeyData.fromObject(value);
                }
                data[id] = fixValue;
              }),
            );
            return data;
          },
          set: async (data) => {
            const tasks: Promise<void>[] = [];
            for (const category in data) {
              for (const id in data[category]) {
                const value: unknown = data[category][id];
                const file = `${category}-${id}`;
                tasks.push(value ? writeData(value, file) : removeData(file));
              }
            }
            await Promise.all(tasks);
          },
        },
      },
      saveState: async (): Promise<void> => {
        await writeData(creds, "creds");
      },
      clearState: async (): Promise<void> => {
        await this.DB.deleteAllSession();
      },
    };
  };

  private DB = new Database();
}

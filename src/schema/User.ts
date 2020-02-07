import { Model, Document, Schema, model } from "mongoose";
import * as jwt from "jwt-simple";
import * as crypto from "crypto";
import { HTTPRequestCode, StatusError } from "../modules/Send-Rule";

export interface EncryptionPassword {
	password: string;
	salt: string;
}
export interface IUserDefaultLogin {
	email: string;
	password: string;
}
export interface IUser extends IUserDefaultLogin {
	username: string;
	salt?: string;
	imagePath?: string;
	lastLoginTime?: Date;
	createdTime?: Date;
}
const UserSchema: Schema = new Schema({
	email: { type: String, required: true, unique: true },
	password: { type: String, required: true },
	username: { type: String, default: "" },
	salt: { type: String, default: process.env.SECRET_KEY || "SECRET" },
	imgPath: { type: String, default: "" },
	lastLoginTime: { type: Date, default: Date.now },
	createdTime: { type: Date, default: Date.now }
});

/**
 * @description User 스키마에 대한 메서드 ( 레코드 )
 */
export interface IUserSchema extends IUser, Document {
	/**
	 * @description 이 유저에 대한 토큰을 생성합니다.
	 * @returns {string} 이 유저에 대한 토큰을 반홚바니다.
	 */
	getUserToken(): string;
	/**
	 * @description 비밀번호를 재설정합니다
	 * @param {string}password 새 비밀번호
	 * @returns {Promise<IUserSchema>} 변경된 유저를 반환합니다.
	 */
	createEncryptionPassword(password: string): Promise<IUserSchema>;
}

/**
 * @description User 모델에 대한 정적 메서드 ( 테이블 )
 */
export interface IUserModel extends Model<IUserSchema> {
	/**
	 * @description 입력받은 유저의 토큰을 생성합니다.
	 * @returns {string} 입력받은 유저에 대한 토큰
	 */
	getToken(data: IUserSchema): string;
	/**
	 * @description 암호화 할 비밀번호를 입력받아 비밀번호와 암호화 키를 반환합니다.
	 * @param {string}password 암호화 할 비밀번호
	 * @returns {Promise<EncryptionPassword>} 비밀번호와 암호화 키를 반환합니다.
	 */
	createEncryptionPassword(password: string, salt?: string): Promise<EncryptionPassword>;
	/**
	 * @description 이메일과 패스워드로 로그인을 시도합니다
	 * @param loginData 로그인 정보
	 * @param {boolean}isEncryptionPassword 평문 비밀번호가 아닐 시 (토큰 사용 로그인 시)
	 * @returns {Promise<IUserSchema>} 로그인 성공 시 유저를 반환합니다.
	 */
	loginAuthentication(loginData: IUserDefaultLogin, isEncryptionPassword?: boolean): Promise<IUserSchema>;
}

UserSchema.methods.getUserToken = function(this: IUserSchema): string {
	let constructor = this.constructor as IUserModel;
	return constructor.getToken(this);
};

UserSchema.methods.resetPassword = async function(this: IUserSchema, password: string): Promise<IUserSchema> {
	try {
		let constructor = this.constructor as IUserModel;
		let encryptionPassword = await constructor.createEncryptionPassword(password);
		this.password = encryptionPassword.password;
		this.salt = encryptionPassword.salt;
		return await this.save();
	} catch (err) {
		throw err;
	}
};

UserSchema.statics.getToken = function(this: IUserModel, data: IUser): string {
	let user: IUserDefaultLogin = {
		email: data.email,
		password: data.password
	};
	return "Bearer " + jwt.encode(user, process.env.SECRET_KEY || "SECRET");
};

UserSchema.statics.createEncryptionPassword = async function(this: IUserModel, password: string, salt?: string): Promise<EncryptionPassword> {
	try {
		let data: EncryptionPassword = {
			password: "",
			salt: salt || ""
		};
		data.salt = data.salt || (await crypto.randomBytes(64).toString("base64"));
		data.password = crypto.pbkdf2Sync(password, data.salt, 10000, 64, "sha512").toString("base64");
		return data;
	} catch (err) {
		throw err;
	}
};

UserSchema.statics.createUser = async function(this: IUserModel, data: IUser): Promise<IUserSchema> {
	if ("email" in data && "password" in data) {
		let encryptionPassword = await this.createEncryptionPassword(data.password);
		data.password = encryptionPassword.password;
		data.salt = encryptionPassword.salt;

		let user = await new this(data).save();
		return user;
	} else {
		throw new StatusError(HTTPRequestCode.BAD_REQUEST, "잘못된 요청");
	}
};

UserSchema.statics.loginAuthentication = async function(this: IUserModel, loginData: IUserDefaultLogin, isEncryptionPassword: boolean = false) {
	try {
		let user = await this.findOne({ email: loginData.email });
		if (!user) {
			throw new StatusError(HTTPRequestCode.UNAUTHORIZED, "존재하지 않는 계정");
		} else {
			// 평문 비밀번호는 암호화된 비밀번호로 변환
			let password = isEncryptionPassword ? loginData.password : (await this.createEncryptionPassword(loginData.password, user.salt)).password;
			if (password == user.password) return user;
			else throw new StatusError(HTTPRequestCode.UNAUTHORIZED, "비밀번호가 일치하지 않음");
		}
	} catch (err) {
		throw err;
	}
};

// CASCADE 구현
UserSchema.pre("remove", () => {});
export default model<IUserSchema>("User", UserSchema) as IUserModel;
